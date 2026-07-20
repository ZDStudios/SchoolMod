import { app, shell, BrowserWindow, nativeTheme, session } from 'electron'
import { join } from 'path'
import { initStores, getSettings } from './store'
import { registerIpc } from './ipc'
import * as seqta from './services/seqta'
import * as ai from './services/claude'
import { findExecutable } from './services/proc'

/** Run with SCHOOLMOD_DIAG=1 to print a full SEQTA connectivity report to stdout. */
async function runDiagnostics() {
  const log = (...a: unknown[]) => console.log('[DIAG]', ...a)
  const s = getSettings().seqta
  log(`mode=${s.mode} connected=${s.connected} base=${s.baseUrl} cookieLen=${s.sessionCookie.length} name="${s.displayName}"`)
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const r: any = await fn()
      const n = Array.isArray(r) ? r.length : typeof r === 'string' ? `${r.length} chars` : JSON.stringify(r)?.slice(0, 160)
      log(`${label}: OK ->`, n)
    } catch (e: any) {
      log(`${label}: FAILED ->`, e?.message)
    }
  }
  if (process.env.SCHOOLMOD_DIAG === 'agent') {
    const { runAgent } = await import('./services/agent')
    for (const q of ['What OneNote notebooks do I have?', 'Switch the app to dark mode, then back to system']) {
      log(`--- ASK: "${q}"`)
      const tools: string[] = []
      let answer = ''
      try {
        await runAgent([{ role: 'user', content: q }], (m) => ai.chat(m), {
          onTool: (t) => tools.push(t),
          onDelta: (t) => (answer += t)
        })
        log('tools called:', tools.join(', ') || '(none)')
        log('answer:', answer.replace(/\s+/g, ' ').slice(0, 300))
      } catch (e: any) {
        log('FAILED:', e?.message)
      }
    }
    log('theme now =', getSettings().theme)
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'study') {
    const nbs = await import('./services/notebooks')
    const decks = await import('./services/flashcards')
    let nbId = ''
    let deckId = ''
    await step('notebook.create', async () => {
      const nb = nbs.create('DIAG notebook')
      nbId = nb.id
      return nb.title
    })
    await step('notebook.addSourceText', () =>
      nbs.addSourceText(nbId, 'diag.txt', 'Photosynthesis converts light energy into glucose in chloroplasts. The Calvin cycle fixes carbon dioxide.')
    )
    await step('notebook.ask', async () => (await nbs.ask(nbId, 'Where does photosynthesis happen?')).answer.slice(0, 120))
    await step('deck.create', async () => {
      const d = decks.create('DIAG deck')
      deckId = d.id
      return d.title
    })
    await step('deck.generate', async () => (await decks.generate(deckId, 'Photosynthesis basics', 4)).cards.length + ' cards')
    // clean up the diagnostic artefacts
    nbs.remove(nbId)
    decks.remove(deckId)
    log('cleaned up DIAG notebook + deck')
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'ms') {
    const ms = await import('./services/msElectron')
    await step('ms.connect', () => ms.connect())
    await step('ms.recentFiles', () => ms.recentFiles())
    let notebooks: any[] = []
    await step('ms.oneNoteNotebooks', async () => {
      notebooks = await ms.oneNoteNotebooks()
      return notebooks.map((n: any) => n.name)
    })
    if (notebooks.length) {
      await step(`ms.readNotebook("${notebooks[0].name}")`, async () => {
        const r = await ms.readNotebook(notebooks[0].name)
        return { notebook: r.notebook, sections: r.sections, pages: r.pages, textLen: r.text.length, textSample: r.text.slice(0, 200) }
      })
    }
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'ai') {
    log('PATH has APPDATA/npm?', (process.env.PATH || '').toLowerCase().includes('roaming\\npm'))
    log('findExecutable(claude) ->', findExecutable('claude'))
    log('findExecutable(codex)  ->', findExecutable('codex'))
    log('findExecutable(npm)    ->', findExecutable('npm'))
    await step('ai.ping', () => ai.ping())
    await step('ai.chat', () => ai.chat([{ role: 'user', content: 'Reply with exactly: AI_OK' }]))
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'concurrent') {
    // Reproduce the dashboard's load: every call fires at once.
    log('running all calls CONCURRENTLY (dashboard simulation)…')
    const t0 = Date.now()
    await Promise.all([
      step('me', () => seqta.me()),
      step('timetable', () => seqta.timetable()),
      step('assessments', () => seqta.assessments()),
      step('notices', () => seqta.notices()),
      step('messages', () => seqta.messages()),
      step('grades', () => seqta.grades()),
      step('photo', () => seqta.photo())
    ])
    log(`concurrent burst finished in ${Math.round((Date.now() - t0) / 1000)}s`)
    log('DONE')
    return
  }
  await step('me', () => seqta.me())
  await step('timetable(today)', () => seqta.timetable())
  await step('timetableWeek', () => seqta.timetableWeek())
  await step('assessments', () => seqta.assessments())
  await step('notices', () => seqta.notices())
  await step('homework', () => seqta.homework())
  await step('grades', () => seqta.grades())
  await step('messages', () => seqta.messages())
  await step('reports', () => seqta.reports())
  await step('photo', () => seqta.photo())
  log('DONE')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'SchoolMod',
    backgroundColor: '#0d0f16',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    frame: process.platform === 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Powers the embedded browser panels (OneNote/Mathspace/Education Perfect).
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Surface renderer warnings/errors and crashes to the main log (useful for support).
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log('[render-process-gone]', JSON.stringify(details))
  })
  mainWindow.webContents.on('did-finish-load', () => console.log('[renderer] did-finish-load'))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite: dev server URL in dev, built file in prod.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initStores()

  // Renderer makes no direct network calls (all external I/O is via IPC in main),
  // so a tight CSP is safe in packaged builds. Skipped in dev where Vite needs eval.
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'"
          ]
        }
      })
    })
  }

  const theme = getSettings().theme
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme

  // Lock down the embedded browser panels (OneNote/Mathspace/Education
  // Perfect): no Node access inside the guest page, and restrict navigation
  // to the school-relevant domains we actually embed.
  const ALLOWED_WEBVIEW_HOSTS =
    /(\.|^)(onenote\.com|onenote\.cloud\.microsoft|sharepoint\.com|officeapps\.live\.com|office\.com|cloud\.microsoft|live\.com|microsoftonline\.com|microsoft\.com|mathspace\.co|educationperfect\.com)$/i
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    contents.setWindowOpenHandler((details) => {
      try {
        const host = new URL(details.url).hostname
        if (ALLOWED_WEBVIEW_HOSTS.test(host)) return { action: 'allow' }
      } catch {
        /* fall through to deny */
      }
      shell.openExternal(details.url).catch(() => {})
      return { action: 'deny' }
    })
    contents.on('will-navigate', (e, url) => {
      try {
        if (!ALLOWED_WEBVIEW_HOSTS.test(new URL(url).hostname)) e.preventDefault()
      } catch {
        e.preventDefault()
      }
    })
  })

  registerIpc(() => mainWindow)
  createWindow()

  if (process.env.SCHOOLMOD_DIAG) runDiagnostics()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

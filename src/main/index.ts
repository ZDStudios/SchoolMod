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
      nodeIntegration: false
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

import { app, shell, BrowserWindow, nativeTheme, session } from 'electron'
import { join } from 'path'
import { initStores, getSettings } from './store'
import { registerIpc } from './ipc'
import { findExecutable } from './services/proc'
import {
  setupTray,
  applyAutoLaunch,
  setupQuickExplain,
  unregisterShortcuts,
  isQuitting,
  markQuitting
} from './services/desktop'

// process.uptime() is measured from actual process start, so it's a reliable
// baseline regardless of how the compiler orders/hoists these imports.
const __mark = (label: string) => {
  if (process.env.SCHOOLMOD_PERF) console.log(`[PERF] +${Math.round(process.uptime() * 1000)}ms  ${label}`)
}
__mark('module graph loaded (all top-level requires done)')

/** Run with SCHOOLMOD_DIAG=1 to print a full SEQTA connectivity report to stdout. */
async function runDiagnostics() {
  const log = (...a: unknown[]) => console.log('[DIAG]', ...a)
  // Loaded here, not at module top, so a normal (non-diagnostic) launch never
  // pays for requiring these services.
  const seqta = await import('./services/seqta')
  const ai = await import('./services/claude')
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
    await step('notebook.addSourceText', async () =>
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
  if (process.env.SCHOOLMOD_DIAG === 'course') {
    const seqta = await import('./services/seqta')
    const subs = await seqta.subjectsList()
    const current = subs.filter((s: any) => s.current)
    log('current-period subjects:', JSON.stringify(current.map((s: any) => s.title)))
    const r = await seqta.courseContent('Science')
    const c = r[0]
    log(`subject=${c.subject} files=${c.files.length} lessons=${c.lessons.length}`)
    const withHtml = c.lessons.filter((l: any) => l.html)
    log(`lessons with html body = ${withHtml.length} / ${c.lessons.length}`)
    // The bug rendered a lesson as the bare number "1". Prove that's gone.
    const numeric = c.lessons.filter((l: any) => /^\d+$/.test((l.notes || '').trim()))
    log('lessons whose entire body is just a number =', numeric.length, '(was the bug)')
    const sample = withHtml.find((l: any) => l.notes.length > 200) || withHtml[0]
    if (sample) {
      log('--- sample lesson ---')
      log('term/week :', sample.term, '/', sample.week)
      log('title     :', sample.title)
      log('files     :', JSON.stringify(sample.files))
      log('html len  :', sample.html.length)
      log('text len  :', sample.notes.length)
      log('text      :', sample.notes.replace(/\s+/g, ' ').slice(0, 400))
      log('html has <script>?', /<script/i.test(sample.html), '| has on* handler?', /\son[a-z]+\s*=/i.test(sample.html))
      log('html head :', sample.html.replace(/\s+/g, ' ').slice(0, 220))
    }
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'computer') {
    const s = await import('./store')
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    s.setSettings({ computerAccess: true })
    const { runAgent } = await import('./services/agent')
    const { chat } = await import('./services/claude')
    const testFile = path.join(os.tmpdir(), 'schoolmod-write-test.txt')
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile)

    for (const q of [`Write the exact text "SCHOOLMOD_WRITE_OK" to the file ${testFile.replace(/\\/g, '\\\\')}`]) {
      log(`--- ASK: "${q}"`)
      let answer = ''
      const tools: string[] = []
      // Wrap chat() to log the model's raw reply at each turn — tells us
      // whether it emitted <tool> syntax at all, vs just narrating in prose.
      let turn = 0
      const chatSpy = async (msgs: any[]) => {
        const r = await chat(msgs)
        log(`  raw reply [turn ${++turn}]:`, JSON.stringify(r))
        return r
      }
      await runAgent([{ role: 'user', content: q }], chatSpy, {
        onTool: (t) => tools.push(t),
        onDelta: (t) => (answer += t)
      })
      log('tools called:', tools.join(', ') || '(none)')
      log('answer (full):', JSON.stringify(answer))
    }

    // Ground truth: did the file actually get written, independent of what the model claims?
    const exists = fs.existsSync(testFile)
    const content = exists ? fs.readFileSync(testFile, 'utf-8') : null
    log('GROUND TRUTH: file exists ->', exists, '| content ->', JSON.stringify(content))
    if (exists) fs.unlinkSync(testFile)

    s.setSettings({ computerAccess: false })
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'raw') {
    // Dump the real /load/courses payload. The lesson parser was written
    // against guessed field names and renders "1" for a whole lesson, so the
    // only way forward is to look at what SEQTA actually returns.
    const direct = await import('./services/seqtaDirect')
    await (direct as any).ensure()
    const subs = await (direct as any).subjects()
    const target = subs.find((s: any) => /science/i.test(s.title)) || subs[0]
    log('subject =', target.title, '| programme =', target.programme, '| metaclass =', target.metaclass)
    const data = await (direct as any).payload('/seqta/student/load/courses', {
      programme: String(target.programme),
      metaclass: String(target.metaclass)
    })
    log('top-level keys =', JSON.stringify(Object.keys(data)))
    for (const k of Object.keys(data)) {
      const v = (data as any)[k]
      log(`  ${k}: ${Array.isArray(v) ? `array[${v.length}]` : typeof v}`)
    }
    const d: any[] = data.d || []
    log('d.length =', d.length)
    log('d[0] keys =', JSON.stringify(Object.keys(d[0] || {})))
    log('d[0] =', JSON.stringify(d[0])?.slice(0, 900))
    log('d[1] =', JSON.stringify(d[1])?.slice(0, 900))
    // `d[i].n` is an INDEX into `w` — that's the real content array.
    const w: any[] = data.w || []
    log('w.length =', w.length)
    log('w[0] keys =', JSON.stringify(Object.keys(w[0] || {})))
    log('w[0] =', JSON.stringify(w[0])?.slice(0, 1200))
    const richest = w.slice().sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0]
    log('richest w entry =', JSON.stringify(richest)?.slice(0, 2000))
    // Does `o` (rendered HTML) cover everything, or does document.contents
    // carry body text that `o` omits? Decides whether the parser needs to walk
    // the module tree as well.
    let withO = 0, withoutO = 0, oTotal = 0
    const moduleTypes = new Map<string, number>()
    const contentKeys = new Set<string>()
    for (const wk of w) {
      for (const item of (Array.isArray(wk) ? wk : [wk])) {
        if (item?.o) { withO++; oTotal += String(item.o).length } else withoutO++
        try {
          const doc = JSON.parse(item?.document?.contents || '{}')
          for (const m of doc?.document?.modules || []) {
            moduleTypes.set(m.type, (moduleTypes.get(m.type) || 0) + 1)
            if (m.content?.value) Object.keys(m.content.value).forEach((k) => contentKeys.add(k))
          }
        } catch { /* not all lessons have a document */ }
      }
    }
    log('lessons with `o` html =', withO, '| without =', withoutO, '| avg o length =', withO ? Math.round(oTotal / withO) : 0)
    log('module types =', JSON.stringify([...moduleTypes.entries()]))
    log('module content.value keys =', JSON.stringify([...contentKeys]))
    const noO = w.flat().find((x: any) => !x?.o && x?.document)
    log('a lesson WITHOUT o =', JSON.stringify(noO)?.slice(0, 700))
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'webview') {
    // Prove the embedded SEQTA browser opens ALREADY SIGNED IN. Seeding the
    // cookie is not enough on its own — the real test is loading the page in a
    // webview-equivalent window and checking it isn't the SSO login screen.
    const { session, BrowserWindow: BW } = await import('electron')
    const cfg = await seqta.prepareWebview()
    log('url =', cfg.url, '| partition =', cfg.partition)

    const ses = session.fromPartition(cfg.partition)
    const cookies = await ses.cookies.get({ name: 'JSESSIONID' })
    log('cookies in partition:', cookies.map((c) => `${c.name}@${c.domain} len=${c.value.length}`).join(', ') || '(none)')

    const w = new BW({
      show: false,
      webPreferences: { partition: cfg.partition, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await w.loadURL(cfg.url).catch((e: any) => log('load error:', e?.message))
    // SEQTA is a SPA — give it a moment to render past the initial shell.
    await new Promise((r) => setTimeout(r, 6000))
    const probe = await w.webContents
      .executeJavaScript(
        `({ url: location.href, title: document.title,
            len: (document.body.innerText || '').length,
            sample: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200) })`,
        true
      )
      .catch((e: any) => ({ error: e?.message }))
    log('final url  =', (probe as any).url)
    log('title      =', (probe as any).title)
    log('text length=', (probe as any).len)
    log('sample     =', (probe as any).sample)

    const u = String((probe as any).url || '')
    const signedIn = !/login\.microsoftonline\.com|\/login/i.test(u) && (probe as any).len > 200
    log('SIGNED IN? ', signedIn)
    w.destroy()
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'toggle') {
    // Ground truth for every boolean setting: flip it through the same
    // setSettings() the UI calls, then read settings.json back off disk and
    // confirm the value actually landed — not just what getSettings() returns
    // from its in-memory cache.
    const st = await import('./store')
    const fs = await import('fs')
    const file = join(app.getPath('userData'), 'store', 'settings.json')
    const onDisk = () => JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^﻿/, ''))

    const cases: { name: string; get: (s: any) => boolean; set: (v: boolean) => void; read: (d: any) => any }[] = [
      { name: 'computerAccess', get: (s) => s.computerAccess, set: (v) => st.setSettings({ computerAccess: v }), read: (d) => d.computerAccess },
      { name: 'notifications.enabled', get: (s) => s.notifications.enabled, set: (v) => st.setSettings({ notifications: { ...st.getSettings().notifications, enabled: v } }), read: (d) => d.notifications?.enabled },
      { name: 'notifications.bells', get: (s) => s.notifications.bells, set: (v) => st.setSettings({ notifications: { ...st.getSettings().notifications, bells: v } }), read: (d) => d.notifications?.bells },
      { name: 'notifications.assessments', get: (s) => s.notifications.assessments, set: (v) => st.setSettings({ notifications: { ...st.getSettings().notifications, assessments: v } }), read: (d) => d.notifications?.assessments },
      { name: 'desktop.tray', get: (s) => s.desktop.tray, set: (v) => st.setSettings({ desktop: { ...st.getSettings().desktop, tray: v } }), read: (d) => d.desktop?.tray },
      { name: 'desktop.autoLaunch', get: (s) => s.desktop.autoLaunch, set: (v) => st.setSettings({ desktop: { ...st.getSettings().desktop, autoLaunch: v } }), read: (d) => d.desktop?.autoLaunch }
    ]

    for (const c of cases) {
      const original = c.get(st.getSettings())
      let ok = true
      // Toggling to false is the interesting direction: a merge bug that drops
      // falsy values would still look fine when everything defaults to true.
      for (const target of [!original, original]) {
        c.set(target)
        const mem = c.get(st.getSettings())
        const disk = c.read(onDisk())
        if (mem !== target || disk !== target) {
          ok = false
          log(`${c.name}: set ${target} -> memory=${mem} disk=${disk}  MISMATCH`)
        }
      }
      log(`${c.name}: ${ok ? 'OK (both directions persisted to disk)' : 'BROKEN'} — restored to ${c.get(st.getSettings())}`)
    }
    log('DONE')
    return
  }
  if (process.env.SCHOOLMOD_DIAG === 'desktop') {
    const { Notification, globalShortcut } = await import('electron')
    const fs = await import('fs')
    const d = getSettings().desktop
    log('notifications supported?', Notification.isSupported())

    // The tray silently no-ops if the icon can't be found at runtime, so prove
    // the packaged-and-dev paths actually resolve to a real file.
    const { iconCandidates } = await import('./services/desktop')
    const paths = iconCandidates()
    paths.forEach((p) => log('icon candidate', fs.existsSync(p) ? 'FOUND  ' : 'missing', p))
    log('icon resolved?', paths.some((p) => fs.existsSync(p)))

    log('shortcut accelerator =', d.quickExplainShortcut)
    log('shortcut registered? ', globalShortcut.isRegistered(d.quickExplainShortcut))

    // Build a real .ics from the real timetable and check it against the spec's
    // hard requirements (CRLF, matching BEGIN/END counts) rather than eyeballing it.
    const seqta = await import('./services/seqta')
    const { buildIcs } = await import('./services/ics')
    let [lessons, assessments]: any[][] = await Promise.all([
      seqta.timetableWeek().catch(() => []),
      seqta.assessments().catch(() => [])
    ])
    // This harness runs under Electron's own userData, so a real session may not
    // be present. Fall back to fixtures that exercise the tricky bits — a comma
    // and a semicolon that must be escaped, and a title long enough to fold.
    if (!lessons.length && !assessments.length) {
      log('(no SEQTA session in this harness — using fixtures)')
      lessons = [
        { description: 'Science, Year 8', staff: 'Mr Smith; Ms Jones', room: 'S12', from: '09:05', until: '10:00', code: '8SCI', day: '2026-07-22' }
      ]
      assessments = [
        { id: 1, title: 'Extended response on photosynthesis and cellular respiration in plants', subject: 'Science', code: '8SCI', due: '2026-07-31', status: 'PENDING' }
      ]
    }
    const ics = buildIcs(lessons as any, assessments as any)
    const begins = (ics.match(/BEGIN:VEVENT/g) || []).length
    const ends = (ics.match(/END:VEVENT/g) || []).length
    log(`ics: ${lessons.length} lessons + ${assessments.length} assessments -> ${begins} VEVENTs (END count ${ends})`)
    log('ics: CRLF line endings?', ics.includes('\r\n') && !/[^\r]\n/.test(ics))
    log('ics: no over-length lines?', ics.split('\r\n').every((l) => l.length <= 75))
    log('ics sample:\n' + ics.split('\r\n').slice(0, 16).join('\n'))
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

  __mark('BrowserWindow constructed')
  mainWindow.on('ready-to-show', () => {
    __mark('ready-to-show (first paint) -> showing window')
    // --hidden is passed by the start-on-login registration: boot with the app
    // resident in the tray rather than stealing focus at every sign-in.
    if (!process.argv.includes('--hidden')) mainWindow?.show()
  })

  // With the tray enabled, closing the window hides it so bell/assessment
  // reminders keep firing. Quit explicitly from the tray menu.
  mainWindow.on('close', (e) => {
    if (getSettings().desktop.tray && !isQuitting()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Surface renderer warnings/errors and crashes to the main log (useful for support).
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log('[render-process-gone]', JSON.stringify(details))
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[renderer] did-finish-load')
    __mark('renderer did-finish-load')
  })

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

__mark('app.whenReady() registered, awaiting...')
app.whenReady().then(() => {
  __mark('app ready (Electron/Chromium engine init done)')
  initStores()
  __mark('initStores done')

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

  /**
   * The school's SEQTA host can't be hardcoded — every school runs its own
   * (Trinity's is students.trinity.wa.edu.au, nothing to do with seqta.com.au),
   * so it's read from the configured base URL at check time.
   */
  const seqtaHostAllowed = (host: string): boolean => {
    const base = getSettings().seqta.baseUrl
    if (!base) return false
    try {
      const seqtaHost = new URL(base).hostname
      return host === seqtaHost || host.endsWith('.' + seqtaHost)
    } catch {
      return false
    }
  }
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    contents.setWindowOpenHandler((details) => {
      try {
        const host = new URL(details.url).hostname
        if (ALLOWED_WEBVIEW_HOSTS.test(host) || seqtaHostAllowed(host)) return { action: 'allow' }
      } catch {
        /* fall through to deny */
      }
      shell.openExternal(details.url).catch(() => {})
      return { action: 'deny' }
    })
    contents.on('will-navigate', (e, url) => {
      try {
        const h = new URL(url).hostname
        if (!ALLOWED_WEBVIEW_HOSTS.test(h) && !seqtaHostAllowed(h)) e.preventDefault()
      } catch {
        e.preventDefault()
      }
    })
  })

  registerIpc(() => mainWindow)
  __mark('registerIpc done')
  createWindow()
  __mark('createWindow() returned')

  setupTray(() => mainWindow)
  applyAutoLaunch()
  setupQuickExplain(() => mainWindow)
  __mark('desktop integrations ready')

  // Deferred so nothing about reminders is on the cold-start critical path.
  setTimeout(async () => {
    const { startNotifications } = await import('./services/notifications')
    startNotifications(() => mainWindow)
  }, 4000)

  if (process.env.SCHOOLMOD_DIAG) runDiagnostics()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
})

app.on('before-quit', () => markQuitting())
app.on('will-quit', () => unregisterShortcuts())

app.on('window-all-closed', () => {
  // With the tray on, the window is hidden rather than destroyed, so this only
  // fires on a real quit.
  if (process.platform !== 'darwin') app.quit()
})

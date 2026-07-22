import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { CH } from '../shared/channels'
import { IpcResult } from '../shared/types'
import * as store from './store'

/** Wrap a handler so every IPC call returns a uniform {ok,data,error} envelope. */
function handle<T>(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T) {
  ipcMain.handle(channel, async (e, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(e, ...args) }
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) }
    }
  })
}

/**
 * Every feature service (SEQTA, notebooks, flashcards, Microsoft, the AI
 * providers) is loaded on first use instead of at app startup. Measured: this
 * cut ~200ms off cold launch, since requiring `openai` and friends eagerly
 * was pure dead weight until the user actually opens that feature. Each
 * loader is called once and cached.
 */
function lazy<T>(loader: () => Promise<T>): () => Promise<T> {
  let mod: T | undefined
  return async () => (mod ??= await loader())
}
const getClaude = lazy(() => import('./services/claude'))
const getClaudeCli = lazy(() => import('./services/claudeCli'))
const getCodexCli = lazy(() => import('./services/codexCli'))
const getAgent = lazy(() => import('./services/agent'))
const getSeqta = lazy(() => import('./services/seqta'))
const getNotebooks = lazy(() => import('./services/notebooks'))
const getFlashcards = lazy(() => import('./services/flashcards'))
const getGraph = lazy(() => import('./services/graph'))
const getMsElectron = lazy(() => import('./services/msElectron'))
const getNotifications = lazy(() => import('./services/notifications'))
const getDesktop = lazy(() => import('./services/desktop'))
const getBackup = lazy(() => import('./services/backup'))
const getIcs = lazy(() => import('./services/ics'))

export function registerIpc(getWindow: () => BrowserWindow | null) {
  // ---- window controls ----
  handle(CH.winMinimize, () => getWindow()?.minimize())
  handle(CH.winMaximizeToggle, () => {
    const w = getWindow()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  handle(CH.winClose, () => getWindow()?.close())
  handle(CH.winIsMaximized, () => !!getWindow()?.isMaximized())

  // ---- settings ----
  handle(CH.settingsGet, () => store.getSettings())
  handle(CH.settingsSet, (_e, patch) => store.setSettings(patch))

  // ---- claude ----
  handle(CH.claudePing, async () => (await getClaude()).ping())
  // Connect flows target whichever AI provider is selected.
  const provider = async () => (store.getSettings().claude.mode === 'codex' ? getCodexCli() : getClaudeCli())
  handle(CH.claudeStatus, async () => (await provider()).status())
  handle(CH.claudeInstall, async (e) => (await provider()).install((line) => e.sender.send(CH.claudeSetupLog, line)))
  handle(CH.claudeLogin, async (e) =>
    (await provider()).login(
      (line) => e.sender.send(CH.claudeSetupLog, line),
      (url) => e.sender.send(CH.claudeLoginUrl, url)
    )
  )
  handle(CH.claudeChat, async (_e, messages, model) => (await getClaude()).chat(messages, model))
  handle(CH.claudeChatStream, async (e, messages, model) => {
    return (await getClaude()).chatStream(
      messages,
      (delta) => e.sender.send(CH.claudeStreamChunk, delta),
      model
    )
  })

  // Tool-using assistant: can read the student's real SEQTA data and drive the app.
  handle(CH.agentChat, async (e, messages) => {
    const before = JSON.stringify(store.getSettings())
    const [{ runAgent }, claude] = await Promise.all([getAgent(), getClaude()])
    const result = await runAgent(
      messages,
      (msgs) => claude.chat(msgs),
      {
        onTool: (name) => e.sender.send(CH.agentTool, name),
        onDelta: (text) => e.sender.send(CH.claudeStreamChunk, text)
      }
    )
    // If a tool changed settings (theme/accent), tell the UI to refresh.
    if (JSON.stringify(store.getSettings()) !== before) e.sender.send(CH.settingsChanged)
    return result
  })

  // ---- seqta ----
  handle(CH.seqtaLogin, async (_e, url, user, pass) => (await getSeqta()).login(url, user, pass))
  handle(CH.seqtaTestMcp, async () => (await getSeqta()).testMcp())
  handle(CH.seqtaConnectSso, async () => (await getSeqta()).connectSso())
  handle(CH.seqtaMe, async () => (await getSeqta()).me())
  handle(CH.seqtaPhoto, async () => (await getSeqta()).photo())
  handle(CH.seqtaLogout, async () => (await getSeqta()).logout())
  handle(CH.seqtaTimetable, async (_e, from, until) => (await getSeqta()).timetable(from, until))
  handle(CH.seqtaTimetableWeek, async () => (await getSeqta()).timetableWeek())
  handle(CH.seqtaAssessments, async () => (await getSeqta()).assessments())
  handle(CH.seqtaNotices, async (_e, date) => (await getSeqta()).notices(date))
  handle(CH.seqtaHomework, async () => (await getSeqta()).homework())
  handle(CH.seqtaGrades, async () => (await getSeqta()).grades())
  handle(CH.seqtaMessages, async () => (await getSeqta()).messages())
  handle(CH.seqtaReports, async () => (await getSeqta()).reports())
  handle(CH.seqtaOpenReport, async (_e, uuid) => (await getSeqta()).openReport(uuid))
  handle(CH.seqtaSubjectsList, async () => (await getSeqta()).subjectsList())
  handle(CH.seqtaCourseContent, async (_e, subjectKeyword) => (await getSeqta()).courseContent(subjectKeyword))

  // ---- notebooks ----
  handle(CH.nbList, async () => (await getNotebooks()).list())
  handle(CH.nbCreate, async (_e, title) => (await getNotebooks()).create(title))
  handle(CH.nbDelete, async (_e, id) => (await getNotebooks()).remove(id))
  handle(CH.nbAddSourceText, async (_e, id, name, text) => (await getNotebooks()).addSourceText(id, name, text))
  handle(CH.nbAddSourceFiles, async (_e, id) => {
    const notebooks = await getNotebooks()
    const win = getWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Add sources to notebook',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md', 'markdown', 'csv', 'json', 'rtf'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return notebooks.list().find((n) => n.id === id)
    return notebooks.addSourceFiles(id, result.filePaths)
  })
  handle(CH.nbRemoveSource, async (_e, id, sourceId) => (await getNotebooks()).removeSource(id, sourceId))
  handle(CH.nbAsk, async (_e, id, q) => (await getNotebooks()).ask(id, q))
  handle(CH.nbSummarise, async (_e, id) => (await getNotebooks()).summarise(id))
  handle(CH.nbStudyGuide, async (_e, id) => (await getNotebooks()).studyGuide(id))
  handle(CH.nbSaveChat, async (_e, id, chat) => (await getNotebooks()).saveChat(id, chat))

  // ---- flashcards ----
  handle(CH.deckList, async () => (await getFlashcards()).list())
  handle(CH.deckCreate, async (_e, title, desc) => (await getFlashcards()).create(title, desc))
  handle(CH.deckDelete, async (_e, id) => (await getFlashcards()).remove(id))
  handle(CH.deckGenerate, async (_e, id, source, count) => (await getFlashcards()).generate(id, source, count))
  handle(CH.deckAddCard, async (_e, id, front, back, hint) => (await getFlashcards()).addCard(id, front, back, hint))
  handle(CH.deckReview, async (_e, id, cardId, grade) => (await getFlashcards()).review(id, cardId, grade))

  // ---- microsoft ----
  handle(CH.msDeviceLogin, async (e) => {
    const graph = await getGraph()
    return graph.startDeviceLogin((result) => e.sender.send('ms:loginDone', result))
  })
  handle(CH.msGraph, async (_e, method, path, body) => (await getGraph()).graph(method, path, body))
  // Quick connect: signs in via Electron's browser — no Azure app registration.
  handle(CH.msQuickConnect, async () => (await getMsElectron()).connect())
  handle(CH.msRecentFiles, async () => (await getMsElectron()).recentFiles())
  handle(CH.msOneNote, async () => (await getMsElectron()).oneNoteNotebooks())
  handle(CH.msReadNotebook, async (_e, nameOrUrl) => (await getMsElectron()).readNotebook(nameOrUrl))
  handle(CH.msGetNotebookUrl, async (_e, nameOrUrl) => (await getMsElectron()).getNotebookUrl(nameOrUrl))
  handle(CH.msOpenApp, async (_e, appKey) => {
    const graph = await getGraph()
    const url = graph.APP_URLS[appKey] || appKey
    return shell.openExternal(url)
  })

  // ---- desktop / notifications / backup ----
  handle(CH.notifyTest, async () => (await getNotifications()).testNotification(getWindow))
  handle(CH.desktopRefresh, async () => (await getDesktop()).refreshDesktop(getWindow))
  handle(CH.backupExport, async () => (await getBackup()).exportAll(getWindow()))
  handle(CH.backupImport, async () => (await getBackup()).importAll(getWindow()))
  handle(CH.icsExport, async () => {
    const seqta = await getSeqta()
    // Pull both in parallel — they're independent SEQTA endpoints.
    const [lessons, assessments] = await Promise.all([
      seqta.timetableWeek().catch(() => []),
      seqta.assessments().catch(() => [])
    ])
    const { buildIcs } = await getIcs()
    const ics = buildIcs(lessons as any, assessments as any)
    const win = getWindow()
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export timetable to calendar',
      defaultPath: 'schoolmod.ics',
      filters: [{ name: 'Calendar', extensions: ['ics'] }]
    })
    if (res.canceled || !res.filePath) return { saved: false }
    require('fs').writeFileSync(res.filePath, ics, 'utf-8')
    return { saved: true, path: res.filePath, events: (lessons as any[]).length + (assessments as any[]).length }
  })

  // ---- misc ----
  handle(CH.openExternal, (_e, url) => shell.openExternal(url))
  handle(CH.saveFile, async (_e, defaultName: string, content: string) => {
    const win = getWindow()
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePath) return { saved: false }
    require('fs').writeFileSync(res.filePath, content, 'utf-8')
    return { saved: true, path: res.filePath }
  })
}

import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { CH } from '../shared/channels'
import { IpcResult } from '../shared/types'
import * as store from './store'
import * as claude from './services/claude'
import * as claudeCli from './services/claudeCli'
import * as codexCli from './services/codexCli'
import { runAgent } from './services/agent'
import { getSettings } from './store'
import * as seqta from './services/seqta'
import * as notebooks from './services/notebooks'
import * as flashcards from './services/flashcards'
import * as graph from './services/graph'
import * as msElectron from './services/msElectron'

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
  handle(CH.claudePing, () => claude.ping())
  // Connect flows target whichever AI provider is selected.
  const provider = () => (getSettings().claude.mode === 'codex' ? codexCli : claudeCli)
  handle(CH.claudeStatus, () => provider().status())
  handle(CH.claudeInstall, (e) => provider().install((line) => e.sender.send(CH.claudeSetupLog, line)))
  handle(CH.claudeLogin, (e) =>
    provider().login(
      (line) => e.sender.send(CH.claudeSetupLog, line),
      (url) => e.sender.send(CH.claudeLoginUrl, url)
    )
  )
  handle(CH.claudeChat, (_e, messages, model) => claude.chat(messages, model))
  handle(CH.claudeChatStream, async (e, messages, model) => {
    return claude.chatStream(
      messages,
      (delta) => e.sender.send(CH.claudeStreamChunk, delta),
      model
    )
  })

  // Tool-using assistant: can read the student's real SEQTA data and drive the app.
  handle(CH.agentChat, async (e, messages) => {
    const before = JSON.stringify(store.getSettings())
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
  handle(CH.seqtaLogin, (_e, url, user, pass) => seqta.login(url, user, pass))
  handle(CH.seqtaTestMcp, () => seqta.testMcp())
  handle(CH.seqtaConnectSso, () => seqta.connectSso())
  handle(CH.seqtaMe, () => seqta.me())
  handle(CH.seqtaPhoto, () => seqta.photo())
  handle(CH.seqtaLogout, () => seqta.logout())
  handle(CH.seqtaTimetable, (_e, from, until) => seqta.timetable(from, until))
  handle(CH.seqtaTimetableWeek, () => seqta.timetableWeek())
  handle(CH.seqtaAssessments, () => seqta.assessments())
  handle(CH.seqtaNotices, (_e, date) => seqta.notices(date))
  handle(CH.seqtaHomework, () => seqta.homework())
  handle(CH.seqtaGrades, () => seqta.grades())
  handle(CH.seqtaMessages, () => seqta.messages())
  handle(CH.seqtaReports, () => seqta.reports())
  handle(CH.seqtaOpenReport, (_e, uuid) => seqta.openReport(uuid))

  // ---- notebooks ----
  handle(CH.nbList, () => notebooks.list())
  handle(CH.nbCreate, (_e, title) => notebooks.create(title))
  handle(CH.nbDelete, (_e, id) => notebooks.remove(id))
  handle(CH.nbAddSourceText, (_e, id, name, text) => notebooks.addSourceText(id, name, text))
  handle(CH.nbAddSourceFiles, async (_e, id) => {
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
  handle(CH.nbRemoveSource, (_e, id, sourceId) => notebooks.removeSource(id, sourceId))
  handle(CH.nbAsk, (_e, id, q) => notebooks.ask(id, q))
  handle(CH.nbSummarise, (_e, id) => notebooks.summarise(id))
  handle(CH.nbStudyGuide, (_e, id) => notebooks.studyGuide(id))
  handle(CH.nbSaveChat, (_e, id, chat) => notebooks.saveChat(id, chat))

  // ---- flashcards ----
  handle(CH.deckList, () => flashcards.list())
  handle(CH.deckCreate, (_e, title, desc) => flashcards.create(title, desc))
  handle(CH.deckDelete, (_e, id) => flashcards.remove(id))
  handle(CH.deckGenerate, (_e, id, source, count) => flashcards.generate(id, source, count))
  handle(CH.deckAddCard, (_e, id, front, back, hint) => flashcards.addCard(id, front, back, hint))
  handle(CH.deckReview, (_e, id, cardId, grade) => flashcards.review(id, cardId, grade))

  // ---- microsoft ----
  handle(CH.msDeviceLogin, async (e) => {
    return graph.startDeviceLogin((result) => e.sender.send('ms:loginDone', result))
  })
  handle(CH.msGraph, (_e, method, path, body) => graph.graph(method, path, body))
  // Quick connect: signs in via Electron's browser — no Azure app registration.
  handle(CH.msQuickConnect, () => msElectron.connect())
  handle(CH.msRecentFiles, () => msElectron.recentFiles())
  handle(CH.msOneNote, () => msElectron.oneNoteNotebooks())
  handle(CH.msReadNotebook, (_e, nameOrUrl) => msElectron.readNotebook(nameOrUrl))
  handle(CH.msOpenApp, (_e, appKey) => {
    const url = graph.APP_URLS[appKey] || appKey
    return shell.openExternal(url)
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

import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../shared/channels'
import type {
  Settings,
  ChatMessage,
  SeqtaLesson,
  SeqtaAssessment,
  SeqtaNotice,
  SeqtaHomeworkGroup,
  SeqtaGrade,
  SeqtaSubjectAverage,
  SeqtaMessage,
  SeqtaReport,
  SeqtaSubject,
  SeqtaCourseContent,
  Notebook,
  RagAnswer,
  Deck,
  ReviewGrade,
  IpcResult
} from '../shared/types'

function invoke<T>(channel: string, ...args: any[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args)
}

const api = {
  win: {
    minimize: () => invoke(CH.winMinimize),
    maximizeToggle: () => invoke<boolean>(CH.winMaximizeToggle),
    close: () => invoke(CH.winClose),
    isMaximized: () => invoke<boolean>(CH.winIsMaximized)
  },
  settings: {
    get: () => invoke<Settings>(CH.settingsGet),
    set: (patch: Partial<Settings>) => invoke<Settings>(CH.settingsSet, patch),
    /** Fires when the agent changes settings (e.g. theme) so the UI can refresh. */
    onChanged: (cb: () => void) => {
      const l = () => cb()
      ipcRenderer.on(CH.settingsChanged, l)
      return () => ipcRenderer.removeListener(CH.settingsChanged, l)
    }
  },
  claude: {
    ping: () => invoke<{ ok: boolean; detail: string }>(CH.claudePing),
    status: () => invoke<{ installed: boolean; authenticated: boolean; version: string }>(CH.claudeStatus),
    install: () => invoke<void>(CH.claudeInstall),
    login: () => invoke<{ ok: boolean }>(CH.claudeLogin),
    onSetupLog: (cb: (line: string) => void) => {
      const l = (_e: any, line: string) => cb(line)
      ipcRenderer.on(CH.claudeSetupLog, l)
      return () => ipcRenderer.removeListener(CH.claudeSetupLog, l)
    },
    onLoginUrl: (cb: (url: string) => void) => {
      const l = (_e: any, url: string) => cb(url)
      ipcRenderer.on(CH.claudeLoginUrl, l)
      return () => ipcRenderer.removeListener(CH.claudeLoginUrl, l)
    },
    chat: (messages: ChatMessage[], model?: string) => invoke<string>(CH.claudeChat, messages, model),
    chatStream: (messages: ChatMessage[], model?: string) =>
      invoke<string>(CH.claudeChatStream, messages, model),
    /** Tool-using agent: reads real SEQTA data and can change app settings. */
    agentChat: (messages: ChatMessage[]) => invoke<string>(CH.agentChat, messages),
    onAgentTool: (cb: (tool: string) => void) => {
      const l = (_e: any, tool: string) => cb(tool)
      ipcRenderer.on(CH.agentTool, l)
      return () => ipcRenderer.removeListener(CH.agentTool, l)
    },
    onStreamChunk: (cb: (delta: string) => void) => {
      const listener = (_e: any, delta: string) => cb(delta)
      ipcRenderer.on(CH.claudeStreamChunk, listener)
      return () => ipcRenderer.removeListener(CH.claudeStreamChunk, listener)
    }
  },
  seqta: {
    login: (url: string, user: string, pass: string) =>
      invoke<{ displayName: string }>(CH.seqtaLogin, url, user, pass),
    testMcp: () => invoke<{ info: string; displayName: string }>(CH.seqtaTestMcp),
    connectSso: () => invoke<{ name: string }>(CH.seqtaConnectSso),
    me: () => invoke<{ name: string; code: string; uuid: string }>(CH.seqtaMe),
    photo: () => invoke<string>(CH.seqtaPhoto),
    logout: () => invoke(CH.seqtaLogout),
    timetable: (from?: string, until?: string) => invoke<SeqtaLesson[]>(CH.seqtaTimetable, from, until),
    timetableWeek: () => invoke<SeqtaLesson[]>(CH.seqtaTimetableWeek),
    assessments: () => invoke<SeqtaAssessment[]>(CH.seqtaAssessments),
    notices: (date?: string) => invoke<SeqtaNotice[]>(CH.seqtaNotices, date),
    homework: () => invoke<SeqtaHomeworkGroup[]>(CH.seqtaHomework),
    grades: () => invoke<{ grades: SeqtaGrade[]; averages: SeqtaSubjectAverage[]; overall: number | null }>(CH.seqtaGrades),
    messages: () => invoke<SeqtaMessage[]>(CH.seqtaMessages),
    reports: () => invoke<SeqtaReport[]>(CH.seqtaReports),
    openReport: (uuid: string) => invoke(CH.seqtaOpenReport, uuid),
    subjectsList: () => invoke<SeqtaSubject[]>(CH.seqtaSubjectsList),
    courseContent: (subjectKeyword: string) => invoke<SeqtaCourseContent[]>(CH.seqtaCourseContent, subjectKeyword)
  },
  notebooks: {
    list: () => invoke<Notebook[]>(CH.nbList),
    create: (title: string) => invoke<Notebook>(CH.nbCreate, title),
    remove: (id: string) => invoke(CH.nbDelete, id),
    addSourceText: (id: string, name: string, text: string) =>
      invoke<Notebook>(CH.nbAddSourceText, id, name, text),
    addSourceFiles: (id: string) => invoke<Notebook>(CH.nbAddSourceFiles, id),
    removeSource: (id: string, sourceId: string) => invoke<Notebook>(CH.nbRemoveSource, id, sourceId),
    ask: (id: string, q: string) => invoke<RagAnswer>(CH.nbAsk, id, q),
    summarise: (id: string) => invoke<Notebook>(CH.nbSummarise, id),
    studyGuide: (id: string) => invoke<string>(CH.nbStudyGuide, id),
    saveChat: (id: string, chat: ChatMessage[]) => invoke<Notebook>(CH.nbSaveChat, id, chat)
  },
  decks: {
    list: () => invoke<Deck[]>(CH.deckList),
    create: (title: string, desc?: string) => invoke<Deck>(CH.deckCreate, title, desc),
    remove: (id: string) => invoke(CH.deckDelete, id),
    generate: (id: string, source: string, count?: number) =>
      invoke<Deck>(CH.deckGenerate, id, source, count),
    addCard: (id: string, front: string, back: string, hint?: string) =>
      invoke<Deck>(CH.deckAddCard, id, front, back, hint),
    review: (id: string, cardId: string, grade: ReviewGrade) =>
      invoke<Deck>(CH.deckReview, id, cardId, grade)
  },
  microsoft: {
    deviceLogin: () =>
      invoke<{ userCode: string; verificationUri: string; message: string; expiresIn: number }>(
        CH.msDeviceLogin
      ),
    onLoginDone: (cb: (r: { ok: boolean; account?: string; error?: string }) => void) => {
      const listener = (_e: any, r: any) => cb(r)
      ipcRenderer.on('ms:loginDone', listener)
      return () => ipcRenderer.removeListener('ms:loginDone', listener)
    },
    graph: (method: string, path: string, body?: unknown) => invoke<any>(CH.msGraph, method, path, body),
    openApp: (appKey: string) => invoke(CH.msOpenApp, appKey),
    /** Sign in via Electron's built-in browser — no Azure app registration needed. */
    quickConnect: () => invoke<{ account: string }>(CH.msQuickConnect),
    recentFiles: () => invoke<{ name: string; url: string; app: string }[]>(CH.msRecentFiles),
    oneNote: () => invoke<{ name: string; url: string; app: string }[]>(CH.msOneNote),
    readNotebook: (nameOrUrl: string) =>
      invoke<{ notebook: string; sections: string[]; pages: string[]; text: string }>(CH.msReadNotebook, nameOrUrl),
    getNotebookUrl: (nameOrUrl: string) => invoke<string>(CH.msGetNotebookUrl, nameOrUrl)
  },
  openExternal: (url: string) => invoke(CH.openExternal, url),
  saveFile: (defaultName: string, content: string) =>
    invoke<{ saved: boolean; path?: string }>(CH.saveFile, defaultName, content)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

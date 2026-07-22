// Shared types used by both the main and renderer processes.

export type ThemeMode = 'light' | 'dark' | 'system'

export interface CodexSettings {
  /** Path/command for the OpenAI Codex CLI (ChatGPT account). */
  cliPath: string
}

export interface ClaudeSettings {
  /**
   * 'cli'     — Claude Code CLI (your Claude subscription, one-click connect)
   * 'codex'   — OpenAI Codex CLI (your ChatGPT account)
   * 'wrapper' — any OpenAI-compatible endpoint
   */
  mode: 'cli' | 'codex' | 'wrapper'
  /** Path/command for the Claude Code CLI (cli mode). */
  cliPath: string
  /** Base URL of the claude-code-openai-wrapper, e.g. http://localhost:8000/v1 (wrapper mode) */
  baseUrl: string
  /** Any non-empty string works with the wrapper (it uses your Claude Code auth). */
  apiKey: string
  model: string
}

export interface SeqtaMcpConfig {
  /** Executable to run the Seqta-MCP-Server, e.g. "python". */
  command: string
  /** Arguments, e.g. ["C:/path/to/seqta_mcp.py"]. */
  args: string[]
  /** Working directory for the server process. */
  cwd: string
}

export interface SeqtaSettings {
  /**
   * 'sso'    — Microsoft SSO via the bundled Python helper (or Puppeteer fallback) → direct JSON API. Gives name + photo.
   * 'mcp'    — spawns the user's Seqta-MCP-Server.
   * 'direct' — plain username/password login (non-SSO schools).
   */
  mode: 'sso' | 'mcp' | 'direct'
  connected: boolean
  /** Base URL of your school's SEQTA Learn portal. */
  baseUrl: string
  /** SSO credentials (sso mode). Stored locally only. */
  email: string
  password: string
  /** Python command used to run the bundled SSO helper. */
  python: string
  /** Persisted SEQTA session cookie (JSESSIONID). */
  sessionCookie: string
  displayName: string
  personUUID: string
  mcp: SeqtaMcpConfig
}

export interface MicrosoftSettings {
  /** Azure AD app (client) id registered by the user. */
  clientId: string
  tenant: string
  account: string
}

export interface NotificationSettings {
  enabled: boolean
  /** "Next period starts in 5 minutes" desktop alerts. */
  bells: boolean
  /** "X is due tomorrow" alerts for upcoming assessments. */
  assessments: boolean
  /** How many minutes before a period starts to warn. */
  bellLeadMinutes: number
}

export interface DesktopSettings {
  /** Keep running in the system tray when the window is closed. */
  tray: boolean
  /** Launch SchoolMod when you log in to your computer. */
  autoLaunch: boolean
  /** Global hotkey: copy anything, press this, and the assistant explains it. */
  quickExplainShortcut: string
}

export interface Settings {
  theme: ThemeMode
  accent: string
  claude: ClaudeSettings
  codex: CodexSettings
  seqta: SeqtaSettings
  microsoft: MicrosoftSettings
  /** Off by default. When on, the AI assistant can browse/read/write files on this device (never delete or run anything). */
  computerAccess: boolean
  notifications: NotificationSettings
  desktop: DesktopSettings
  onboardingDone: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: '#3366ff',
  claude: {
    mode: 'cli',
    cliPath: 'claude',
    baseUrl: 'http://localhost:8000/v1',
    apiKey: 'schoolmod',
    model: 'claude-sonnet-5'
  },
  codex: { cliPath: 'codex' },
  seqta: {
    mode: 'sso',
    connected: false,
    baseUrl: '',
    email: '',
    password: '',
    python: 'python',
    sessionCookie: '',
    displayName: '',
    personUUID: '',
    mcp: { command: 'python', args: [], cwd: '' }
  },
  microsoft: { clientId: '', tenant: 'common', account: '' },
  computerAccess: false,
  notifications: { enabled: true, bells: true, assessments: true, bellLeadMinutes: 5 },
  desktop: { tray: true, autoLaunch: false, quickExplainShortcut: 'CommandOrControl+Shift+E' },
  onboardingDone: false
}

// ---- Chat ----
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ---- SEQTA ----
export interface SeqtaLesson {
  description: string
  staff: string
  room: string
  from: string // HH:MM
  until: string // HH:MM
  code: string
  colour?: string
  day?: string
}

export interface SeqtaAssessment {
  id: number
  title: string
  subject: string
  code: string
  due: string // ISO date
  status?: string
  results?: string
}

export interface SeqtaNotice {
  id: number
  title: string
  label: string
  staff: string
  content: string
  colour?: string
}

export interface SeqtaHomeworkGroup {
  subject: string
  items: string[]
}

export interface SeqtaGrade {
  subject: string
  title: string
  due: string
  status: string
  percentage: number | null
}

export interface SeqtaSubjectAverage {
  subject: string
  average: number | null
  count: number
}

export interface SeqtaMessage {
  id: number
  subject: string
  sender: string
  date: string
  read: boolean
}

export interface SeqtaReport {
  uuid: string
  types: string
  terms: string
  year: string
  date: string
}

export interface SeqtaSubject {
  code: string
  title: string
  /** SEQTA's own enrolment period, e.g. "2026S1". */
  period: string
  /** True if this is the most recent period across all the student's subjects — i.e. this year. */
  current: boolean
}

export interface SeqtaLessonContent {
  term: string
  week: string
  title: string
  /** Plain-text body — used for search, the agent, and notebook import. */
  notes: string
  /** Sanitised HTML body as the teacher authored it (tables, headings, colour). */
  html: string
  files: string[]
}

export interface SeqtaCourseContent {
  subject: string
  code: string
  files: string[]
  /** Individually selectable lessons, in schedule order. */
  lessons: SeqtaLessonContent[]
  /** All lessons flattened to one block — kept for import-as-notebook-source / agent use. */
  text: string
}

// ---- Notebooks (RAG) ----
export interface NotebookSource {
  id: string
  name: string
  type: string
  addedAt: number
  charCount: number
}

export interface NotebookChunk {
  id: string
  sourceId: string
  sourceName: string
  index: number
  text: string
}

export interface Notebook {
  id: string
  title: string
  emoji: string
  createdAt: number
  updatedAt: number
  sources: NotebookSource[]
  chunks: NotebookChunk[]
  summary: string
  chat: ChatMessage[]
}

export interface Citation {
  sourceName: string
  sourceId: string
  chunkIndex: number
  snippet: string
}

export interface RagAnswer {
  answer: string
  citations: Citation[]
}

// ---- Flashcards (spaced repetition, SM-2) ----
export interface Flashcard {
  id: string
  front: string
  back: string
  hint?: string
  // SM-2 scheduling state
  ease: number
  interval: number // days
  repetitions: number
  due: number // epoch ms
  lapses: number
}

export interface Deck {
  id: string
  title: string
  emoji: string
  description: string
  createdAt: number
  cards: Flashcard[]
}

export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5

export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

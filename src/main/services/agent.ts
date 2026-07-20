import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { shell } from 'electron'
import { getSettings, setSettings, getNotebooks, getDecks } from '../store'
import * as seqta from './seqta'
import * as notebooks from './notebooks'
import * as flashcards from './flashcards'
import * as msElectron from './msElectron'
import { bellState } from '../../shared/bells'
import { ChatMessage } from '../../shared/types'

/**
 * A provider-agnostic agent loop: the model can call SchoolMod's own tools to
 * read the user's real SEQTA data and drive the app (themes, notebooks, decks).
 *
 * We use a plain-text tool protocol rather than provider-native function calling
 * so it works identically across the Claude CLI, Codex and the OpenAI wrapper.
 */

export interface Tool {
  name: string
  description: string
  args: string
  run: (args: any) => Promise<unknown> | unknown
}

const ok = (msg: string) => ({ ok: true, message: msg })

const BASE_TOOLS: Tool[] = [
  // ---- SEQTA (read) ----
  {
    name: 'seqta_me',
    description: "The student's own name, student code and id.",
    args: '{}',
    run: () => seqta.me()
  },
  {
    name: 'seqta_timetable',
    description: 'Lessons for a date (YYYY-MM-DD, defaults today). Use seqta_timetable_week for the whole week.',
    args: '{"date"?: "YYYY-MM-DD"}',
    run: (a) => seqta.timetable(a?.date, a?.date)
  },
  {
    name: 'seqta_timetable_week',
    description: 'All lessons for the current week.',
    args: '{}',
    run: () => seqta.timetableWeek()
  },
  {
    name: 'seqta_assessments',
    description: 'Upcoming and overdue assessments with due dates and subjects.',
    args: '{}',
    run: () => seqta.assessments()
  },
  {
    name: 'seqta_grades',
    description: 'Marked results, per-subject averages and the overall average.',
    args: '{}',
    run: () => seqta.grades()
  },
  {
    name: 'seqta_notices',
    description: 'School notices for a date (defaults today).',
    args: '{"date"?: "YYYY-MM-DD"}',
    run: (a) => seqta.notices(a?.date)
  },
  { name: 'seqta_homework', description: 'Homework set, grouped by subject.', args: '{}', run: () => seqta.homework() },
  { name: 'seqta_messages', description: 'Recent SEQTA inbox messages.', args: '{}', run: () => seqta.messages() },
  { name: 'seqta_subjects', description: 'List enrolled subjects with their exact codes/titles.', args: '{}', run: () => seqta.subjectsList() },
  {
    name: 'seqta_course_content',
    description: 'Lesson plan / course content and files for a subject. Use to help the student study or to build a notebook/flashcards from class material.',
    args: '{"subject": "string"}',
    run: (a) => {
      if (!a?.subject) throw new Error('Missing "subject".')
      return seqta.courseContent(String(a.subject))
    }
  },
  {
    name: 'bell_times',
    description: 'Current period, next period and minutes until the next bell.',
    args: '{}',
    run: () => bellState('trinity')
  },

  // ---- App control ----
  {
    name: 'app_set_theme',
    description: 'Change the app theme.',
    args: '{"theme": "light" | "dark" | "system"}',
    run: (a) => {
      const theme = ['light', 'dark', 'system'].includes(a?.theme) ? a.theme : 'system'
      setSettings({ theme })
      return ok(`Theme set to ${theme}.`)
    }
  },
  {
    name: 'app_set_accent',
    description: 'Change the accent colour. Accepts a hex colour or a common colour name.',
    args: '{"colour": "#3366ff" | "blue" | "purple" | "pink" | "red" | "orange" | "green" | "teal" | "amber"}',
    run: (a) => {
      const named: Record<string, string> = {
        blue: '#3366ff', purple: '#7c3aed', pink: '#db2777', red: '#e11d48',
        orange: '#ea580c', green: '#16a34a', teal: '#0891b2', amber: '#f59e0b'
      }
      const raw = String(a?.colour || '').toLowerCase().trim()
      const accent = /^#[0-9a-f]{6}$/.test(raw) ? raw : named[raw]
      if (!accent) return { ok: false, message: `Unknown colour. Try one of: ${Object.keys(named).join(', ')}` }
      setSettings({ accent })
      return ok(`Accent set to ${accent}.`)
    }
  },
  {
    name: 'app_list_notebooks',
    description: 'List the notebooks and how many sources each has.',
    args: '{}',
    run: () => getNotebooks().map((n) => ({ id: n.id, title: n.title, sources: n.sources.length }))
  },
  {
    name: 'app_create_notebook',
    description: 'Create a new (empty) notebook.',
    args: '{"title": "string"}',
    run: (a) => {
      const nb = notebooks.create(String(a?.title || 'Untitled notebook'))
      return ok(`Created notebook "${nb.title}".`)
    }
  },
  {
    name: 'app_list_decks',
    description: 'List flashcard decks with card counts and how many are due.',
    args: '{}',
    run: () =>
      getDecks().map((d) => ({
        id: d.id,
        title: d.title,
        cards: d.cards.length,
        due: d.cards.filter((c) => c.due <= Date.now() || c.repetitions === 0).length
      }))
  },
  {
    name: 'app_create_flashcards',
    description:
      'Create a flashcard deck and fill it with AI-generated cards about a topic. Use this when the user asks for flashcards.',
    args: '{"title": "string", "topic": "string", "count"?: number}',
    run: async (a) => {
      const deck = flashcards.create(String(a?.title || a?.topic || 'New deck'))
      const updated = await flashcards.generate(deck.id, String(a?.topic || a?.title), Number(a?.count) || 12)
      return ok(`Created deck "${updated.title}" with ${updated.cards.length} cards.`)
    }
  },
  // ---- Microsoft 365 / OneNote ----
  {
    name: 'ms_onenote_notebooks',
    description: "List the student's OneNote notebooks (school + personal). Requires Microsoft to be connected in Settings.",
    args: '{}',
    run: () => {
      if (!msElectron.isConnected()) return { ok: false, message: 'Microsoft is not connected. Ask the user to connect it in Settings → Microsoft.' }
      return msElectron.oneNoteNotebooks()
    }
  },
  {
    name: 'ms_onenote_read',
    description:
      'Open a specific OneNote notebook and read its sections, page titles and visible page text. Use the exact notebook name from ms_onenote_notebooks.',
    args: '{"notebook": "string"}',
    run: (a) => {
      if (!msElectron.isConnected()) return { ok: false, message: 'Microsoft is not connected. Ask the user to connect it in Settings → Microsoft.' }
      if (!a?.notebook) return { ok: false, message: 'Missing "notebook" argument.' }
      return msElectron.readNotebook(String(a.notebook))
    }
  },
  {
    name: 'ms_recent_files',
    description: 'Recently used Word/Excel/PowerPoint/OneDrive files.',
    args: '{}',
    run: () => {
      if (!msElectron.isConnected()) return { ok: false, message: 'Microsoft is not connected. Ask the user to connect it in Settings → Microsoft.' }
      return msElectron.recentFiles()
    }
  },

  {
    name: 'app_get_settings',
    description: 'Current app settings (theme, accent, which integrations are connected).',
    args: '{}',
    run: () => {
      const s = getSettings()
      return {
        theme: s.theme,
        accent: s.accent,
        seqtaConnected: s.seqta.connected,
        seqtaMode: s.seqta.mode,
        aiProvider: s.claude.mode,
        microsoftAccount: s.microsoft.account || null
      }
    }
  }
]

// ---- Computer access (opt-in via Settings → AI Assistant → "Let the assistant
// access this computer"). Strictly READ-ONLY: browse folders, read text files,
// search filenames, and open a file/folder in its default app. No writing,
// deleting, or running anything — that boundary holds regardless of the toggle.
const MAX_FILE_BYTES = 300_000
const MAX_LIST_ENTRIES = 200

function safePath(p: string): string {
  const resolved = resolve(String(p || homedir()).replace(/^~/, homedir()))
  if (!existsSync(resolved)) throw new Error(`Path does not exist: ${resolved}`)
  return resolved
}

const COMPUTER_TOOLS: Tool[] = [
  {
    name: 'computer_list_dir',
    description: "List files and folders in a directory on the student's computer. Omit path to start at their home folder.",
    args: '{"path"?: "string"}',
    run: (a) => {
      const dir = safePath(a?.path || homedir())
      const st = statSync(dir)
      if (!st.isDirectory()) throw new Error(`Not a directory: ${dir}`)
      const entries = readdirSync(dir, { withFileTypes: true })
        .slice(0, MAX_LIST_ENTRIES)
        .map((e) => {
          let size: number | null = null
          try {
            if (e.isFile()) size = statSync(join(dir, e.name)).size
          } catch {
            /* permission errors etc — skip size */
          }
          return { name: e.name, type: e.isDirectory() ? 'folder' : 'file', size }
        })
      return { path: dir, entries }
    }
  },
  {
    name: 'computer_read_file',
    description: `Read a text file's contents (source code, notes, .txt/.md/.csv/.json etc). Files over ${Math.round(MAX_FILE_BYTES / 1000)}KB are truncated.`,
    args: '{"path": "string"}',
    run: (a) => {
      if (!a?.path) throw new Error('Missing "path".')
      const file = safePath(a.path)
      const st = statSync(file)
      if (st.isDirectory()) throw new Error(`"${file}" is a folder, not a file. Use computer_list_dir.`)
      const buf = readFileSync(file)
      const truncated = buf.length > MAX_FILE_BYTES
      const text = buf.slice(0, MAX_FILE_BYTES).toString('utf-8')
      return { path: file, bytes: st.size, truncated, text }
    }
  },
  {
    name: 'computer_search_files',
    description: 'Search for files by name (substring match) under a folder, recursively. Defaults to the home folder.',
    args: '{"query": "string", "dir"?: "string"}',
    run: (a) => {
      if (!a?.query) throw new Error('Missing "query".')
      const start = safePath(a?.dir || homedir())
      const q = String(a.query).toLowerCase()
      const results: string[] = []
      const skip = /^(node_modules|\.git|\.cache|AppData|\$Recycle\.Bin|System Volume Information)$/i
      const walk = (dir: string, depth: number) => {
        if (results.length >= 100 || depth > 6) return
        let entries: import('fs').Dirent[]
        try {
          entries = readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const e of entries) {
          if (results.length >= 100) return
          if (skip.test(e.name)) continue
          const full = join(dir, e.name)
          if (e.name.toLowerCase().includes(q)) results.push(full)
          if (e.isDirectory()) walk(full, depth + 1)
        }
      }
      walk(start, 0)
      return { query: a.query, searchedFrom: start, matches: results }
    }
  },
  {
    name: 'computer_open_path',
    description: "Open a file or folder in its default app (like double-clicking it) — e.g. open a homework PDF the student mentions.",
    args: '{"path": "string"}',
    run: async (a) => {
      if (!a?.path) throw new Error('Missing "path".')
      const p = safePath(a.path)
      const err = await shell.openPath(p)
      if (err) throw new Error(err)
      return ok(`Opened ${p}`)
    }
  }
]

function activeTools(): Tool[] {
  return getSettings().computerAccess ? [...BASE_TOOLS, ...COMPUTER_TOOLS] : BASE_TOOLS
}

function toolDocs(tools: Tool[]): string {
  return tools.map((t) => `- ${t.name} ${t.args} — ${t.description}`).join('\n')
}

function systemPrompt(tools: Tool[]): string {
  return `You are SchoolMod Assistant, a sharp, friendly study companion built into the SchoolMod desktop app.

You can call tools to read the student's REAL school data and to control the app.

AVAILABLE TOOLS:
${toolDocs(tools)}

HOW TO CALL A TOOL — emit exactly one line, nothing else:
<tool>{"name":"tool_name","args":{}}</tool>

Rules:
- Call a tool whenever the answer depends on the student's actual data (timetable, assessments, grades, notices, homework, messages, OneNote content) or when they ask you to change something in the app. Never guess or make up their data.
- NEVER ask permission before calling a read-only tool. Reading data (SEQTA, OneNote, settings) cannot break anything, so just call the tool and answer — asking "want me to open it?" wastes the user's turn and is treated as a mistake.
- If asked what's IN a notebook, or about topics/content/pages in a subject's notes, this ALWAYS takes exactly two tool calls in the SAME turn, never one: (1) ms_onenote_notebooks to get the exact name, (2) ms_onenote_read with that exact name — then answer from its "pages"/"text" fields. Example: user asks "what topics are in my Humanities notebook" → call ms_onenote_notebooks → see "2026 Humanities Course 2 (Mainstream) 8HU23 Notebook" → immediately call ms_onenote_read with that exact string → THEN answer using its content. Stopping after step 1 is wrong.
- You will then receive an OBSERVATION with the result, and may call another tool or answer.
- When you have what you need, reply normally in markdown. Do NOT mention tool names or the tool syntax in your final answer — just answer naturally.
- Keep answers concise and useful. Show working for maths. Encourage understanding, never just hand over answers to assessments.
${
  tools.some((t) => t.name.startsWith('computer_'))
    ? '- You have READ-ONLY access to this computer\'s files (list/read/search/open). Never claim you can write, delete, move or run anything — you cannot, by design.'
    : ''
}
- Dates are YYYY-MM-DD. Today is ${new Date().toISOString().slice(0, 10)}.`
}

const TOOL_RE = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/

export interface AgentEvents {
  onTool?: (name: string) => void
  onDelta: (text: string) => void
}

/**
 * Runs the tool loop. `chatFn` is the underlying provider call (non-streaming),
 * injected so this works with Claude, Codex or the wrapper.
 */
export async function runAgent(
  messages: ChatMessage[],
  chatFn: (msgs: ChatMessage[]) => Promise<string>,
  ev: AgentEvents,
  maxSteps = 6
): Promise<string> {
  const tools = activeTools()
  const convo: ChatMessage[] = [
    { role: 'system', content: systemPrompt(tools) },
    ...messages.filter((m) => m.role !== 'system')
  ]

  for (let step = 0; step < maxSteps; step++) {
    const reply = await chatFn(convo)
    const match = reply.match(TOOL_RE)

    if (!match) {
      ev.onDelta(reply.trim())
      return reply.trim()
    }

    let call: { name?: string; args?: any } = {}
    try {
      call = JSON.parse(match[1])
    } catch {
      ev.onDelta(reply.replace(TOOL_RE, '').trim() || 'Sorry — I got confused mid-step. Try asking again.')
      return reply
    }

    const tool = tools.find((t) => t.name === call.name)
    convo.push({ role: 'assistant', content: match[0] })

    if (!tool) {
      convo.push({ role: 'user', content: `OBSERVATION: no such tool "${call.name}". Available: ${tools.map((t) => t.name).join(', ')}` })
      continue
    }

    ev.onTool?.(tool.name)
    try {
      const result = await tool.run(call.args || {})
      const json = JSON.stringify(result)
      convo.push({
        role: 'user',
        content:
          `OBSERVATION (${tool.name}): ${json.length > 6000 ? json.slice(0, 6000) + '…(truncated)' : json}\n\n` +
          `Now answer my ORIGINAL request using this result. If it was an action, confirm briefly what you did. ` +
          `Do not greet me, do not restate the question, and do not mention tools.`
      })
    } catch (e: any) {
      convo.push({ role: 'user', content: `OBSERVATION (${tool.name}) FAILED: ${e?.message || e}` })
    }
  }

  const fallback = "I couldn't finish that in a reasonable number of steps — try narrowing the question."
  ev.onDelta(fallback)
  return fallback
}

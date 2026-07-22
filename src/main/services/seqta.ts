import { getSettings, setSettings } from '../store'
import { callTool, disconnect as mcpDisconnect } from './mcpClient'
import * as direct from './seqtaDirect'
import {
  SeqtaAssessment,
  SeqtaLesson,
  SeqtaNotice,
  SeqtaHomeworkGroup
} from '../../shared/types'

/**
 * SEQTA data, from one of two sources:
 *  - 'mcp'   : spawns the user's Seqta-MCP-Server (github.com/ZDStudios/Seqta-MCP-Server),
 *              which handles Microsoft SSO and returns formatted text we parse here.
 *  - 'direct': username/password login to /seqta/student/* (for non-SSO schools).
 */

function seqta() {
  return getSettings().seqta
}
function mode() {
  return seqta().mode
}
const ymd = (d: Date) => d.toISOString().slice(0, 10)

// ---------- shared helpers ----------
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

// ==========================================================================
//  MCP-backed parsers (text → structured)
// ==========================================================================
async function mcpTimetable(from?: string, until?: string): Promise<SeqtaLesson[]> {
  const text = await callTool(seqta().mcp, 'get_timetable', {
    from_date: from || '',
    until_date: until || ''
  })
  if (/no timetable/i.test(text)) return []
  const re =
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+\[([^\]]*)\]\s+(.*?)\s+\(([^)]*)\)\s+Room:\s*(.*?)\s+Teacher:\s*(.*?)\s*$/
  const out: SeqtaLesson[] = []
  for (const line of text.split('\n')) {
    const m = line.match(re)
    if (m)
      out.push({
        day: m[1],
        from: m[2],
        until: m[3],
        code: m[6],
        description: m[5],
        room: m[7] === '?' ? '' : m[7],
        staff: m[8] === '?' ? '' : m[8]
      })
  }
  return out.sort((a, b) => (a.day + a.from > b.day + b.from ? 1 : -1))
}

async function mcpAssessments(): Promise<SeqtaAssessment[]> {
  const text = await callTool(seqta().mcp, 'get_upcoming_assessments', {})
  const re = /^\[(\d{4}-\d{2}-\d{2})\]\s*(?:⚠️\s*OVERDUE\s*)?(\S+)\s+(.*?):\s*(.*?)\s*\(status:\s*([^)]*)\)\s*$/
  const out: SeqtaAssessment[] = []
  let i = 0
  for (const line of text.split('\n')) {
    const m = line.match(re)
    if (m)
      out.push({
        id: i++,
        due: m[1],
        code: m[2],
        subject: m[3],
        title: m[4],
        status: m[5]
      })
  }
  return out
}

async function mcpNotices(date?: string): Promise<SeqtaNotice[]> {
  const text = await callTool(seqta().mcp, 'get_notices', { date: date || '' })
  if (/^no notices/i.test(text.trim())) return []
  const blocks = text.split(/\n-{3,}\n/)
  const out: SeqtaNotice[] = []
  let i = 0
  for (const block of blocks) {
    const b = block.trim()
    if (!b) continue
    const m = b.match(/^\[([^\]]*)\]\s*([\s\S]*)$/)
    const label = m ? m[1] : ''
    const body = decodeEntities(m ? m[2] : b)
    const title = body.split('\n').find((l) => l.trim())?.slice(0, 90) || 'Notice'
    out.push({ id: i++, label, title, staff: '', content: body })
  }
  return out
}

async function mcpHomework(): Promise<SeqtaHomeworkGroup[]> {
  const text = await callTool(seqta().mcp, 'get_homework', {})
  if (/no homework/i.test(text)) return []
  const groups: SeqtaHomeworkGroup[] = []
  let current: SeqtaHomeworkGroup | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const h = line.match(/^={2,}\s*(.+?)\s*={2,}$/)
    if (h) {
      current = { subject: h[1], items: [] }
      groups.push(current)
    } else if (line && current) {
      current.items.push(decodeEntities(line))
    }
  }
  return groups.filter((g) => g.items.length)
}

// ==========================================================================
//  Direct login (non-SSO schools)
// ==========================================================================
function base(): string {
  const url = seqta().baseUrl.trim().replace(/\/$/, '')
  if (!url) throw new Error('No SEQTA URL configured. Add it in Settings → SEQTA.')
  return url
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      Cookie: seqta().sessionCookie
    },
    body: JSON.stringify(body ?? {})
  })
  if (res.status === 403 || res.status === 401)
    throw new Error('SEQTA session expired. Please reconnect in Settings.')
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('SEQTA returned a non-JSON response (check the URL / login).')
  }
  if (json.status && String(json.status) !== '200') throw new Error(json.message || `SEQTA error ${json.status}`)
  return json.payload ?? json
}

export async function login(baseUrl: string, username: string, password: string): Promise<{ displayName: string }> {
  const clean = baseUrl.trim().replace(/\/$/, '')
  const res = await fetch(`${clean}/seqta/student/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  const jsession = setCookies
    .map((c) => c.split(';')[0])
    .filter((c) => /JSESSIONID=/i.test(c))
    .join('; ')
  const json = await res.json().catch(() => ({}))
  if (!jsession) throw new Error(json?.message || 'Login failed — check your URL, username and password.')
  const p = json.payload ?? {}
  const displayName: string =
    p.displayName || `${p.firstname ?? ''} ${p.surname ?? ''}`.trim() || username
  setSettings({
    seqta: { ...seqta(), mode: 'direct', connected: true, baseUrl: clean, sessionCookie: jsession, displayName }
  })
  return { displayName }
}

async function directTimetable(from?: string, until?: string): Promise<SeqtaLesson[]> {
  const f = from || ymd(new Date())
  const u = until || f
  const payload = await post('/seqta/student/load/timetable', { from: f, until: u, student: 69 }).catch(() =>
    post('/seqta/student/load/timetable', { from: f, until: u })
  )
  const items: any[] = payload.items || (Array.isArray(payload) ? payload : [])
  return items
    .map((l) => ({
      description: l.description || l.title || 'Lesson',
      staff: l.staff || '',
      room: l.room || '',
      from: l.from || '',
      until: l.until || '',
      code: l.code || '',
      colour: l.colour,
      day: l.date || f
    }))
    .sort((a, b) => (a.from > b.from ? 1 : -1))
}

async function directAssessments(): Promise<SeqtaAssessment[]> {
  const payload = await post('/seqta/student/assessment/list/upcoming', { student: 69 }).catch(() =>
    post('/seqta/student/assessment/list/upcoming', {})
  )
  const items: any[] = Array.isArray(payload) ? payload : payload.items || []
  return items.map((a, i) => ({
    id: a.id ?? i,
    title: a.title || 'Assessment',
    subject: a.subject || a.metaclass || '',
    code: a.code || '',
    due: a.due || a.dueDate || '',
    status: a.status || ''
  }))
}

async function directNotices(date?: string): Promise<SeqtaNotice[]> {
  const payload = await post('/seqta/student/load/notices', { date: date || ymd(new Date()) }).catch(() => [])
  const items: any[] = Array.isArray(payload) ? payload : payload.items || []
  return items.map((n, i) => ({
    id: n.id ?? i,
    title: n.title || 'Notice',
    label: n.label_title || n.label || '',
    staff: n.staff || '',
    content: (n.contents || n.content || '').replace(/<[^>]+>/g, ' ').trim(),
    colour: n.colour
  }))
}

// ==========================================================================
//  Public API (branches on mode)
// ==========================================================================
export async function testMcp(): Promise<{ info: string; displayName: string }> {
  const info = await callTool(seqta().mcp, 'get_session_info', {})
  const codeMatch = info.match(/student\s*code[:\s]+([A-Za-z0-9._-]+)/i)
  const displayName = codeMatch ? codeMatch[1] : 'SEQTA'
  setSettings({ seqta: { ...seqta(), mode: 'mcp', connected: true, displayName } })
  return { info, displayName }
}

/** SSO connect: acquires a session and returns the student's real name. */
export async function connectSso(): Promise<{ name: string }> {
  direct.clear()
  const info = await direct.ensure(true)
  return { name: info.name }
}

export async function me(): Promise<{ name: string; code: string; uuid: string }> {
  if (mode() !== 'sso') return { name: seqta().displayName, code: '', uuid: '' }
  return direct.me()
}

export async function photo(): Promise<string> {
  if (mode() !== 'sso') throw new Error('Photo requires SSO mode.')
  return direct.photo()
}

export async function logout() {
  await mcpDisconnect().catch(() => {})
  direct.clear()
  setSettings({ seqta: { ...seqta(), connected: false, sessionCookie: '', displayName: '', personUUID: '' } })
}

export const timetable = (from?: string, until?: string) =>
  mode() === 'sso' ? direct.timetable(from, until) : mode() === 'mcp' ? mcpTimetable(from, until) : directTimetable(from, until)
export const timetableWeek = () =>
  mode() === 'sso' ? direct.timetableWeek() : mode() === 'mcp' ? mcpTimetable() : directTimetable()
export const assessments = () =>
  mode() === 'sso' ? direct.assessments() : mode() === 'mcp' ? mcpAssessments() : directAssessments()
export const notices = (date?: string) =>
  mode() === 'sso' ? direct.notices(date) : mode() === 'mcp' ? mcpNotices(date) : directNotices(date)
export const homework = (): Promise<SeqtaHomeworkGroup[]> =>
  mode() === 'sso' ? direct.homework() : mode() === 'mcp' ? mcpHomework() : Promise.resolve([])

// SSO-only rich features (direct JSON API)
export const grades = () => direct.grades()
export const messages = () => direct.messages()
export const reports = () => direct.reports()
export const openReport = (uuid: string) => direct.openReport(uuid)
export const subjectsList = () => direct.subjectsList()
export const courseContent = (subjectKeyword: string) => direct.courseContent(subjectKeyword)
/** Signed-in URL + session partition for the embedded SEQTA browser. */
export const prepareWebview = () => direct.prepareWebview()

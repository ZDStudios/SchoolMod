import { app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { getSettings, setSettings } from '../store'
import { resolveCommand } from './mcpClient'
import { puppeteerLogin } from './seqtaPuppeteer'
import { electronSsoLogin } from './seqtaElectron'
import { shell } from 'electron'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import {
  SeqtaAssessment,
  SeqtaLesson,
  SeqtaNotice,
  SeqtaHomeworkGroup,
  SeqtaGrade,
  SeqtaSubjectAverage,
  SeqtaMessage,
  SeqtaReport
} from '../../shared/types'

/**
 * Primary SEQTA integration: obtain a JSESSIONID (via the bundled Python SSO
 * helper, or Puppeteer as a fallback), then hit the SEQTA JSON API directly.
 * This yields structured data plus the student's real name and photo.
 */

interface Identity {
  cookie: string
  base: string
  name: string
  uuid: string
  id: number
  code: string
}
let identity: Identity | null = null

function base(): string {
  const url = getSettings().seqta.baseUrl.trim().replace(/\/$/, '')
  if (!url) throw new Error('No SEQTA URL set. Add it in Settings → SEQTA.')
  return url
}

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'seqta_session.py')
    : join(app.getAppPath(), 'resources', 'seqta_session.py')
}

function runHelper(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const cmd = resolveCommand(getSettings().seqta.python || 'python')
    const child = spawn(cmd, [helperPath(), ...args], { windowsHide: true })
    let out = ''
    let errOut = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (errOut += d))
    child.on('error', (e) => reject(new Error(`Could not run Python (${cmd}): ${e.message}`)))
    child.on('close', () => {
      const line = out.trim().split('\n').filter(Boolean).pop() || ''
      try {
        resolve(JSON.parse(line))
      } catch {
        reject(new Error(errOut.trim() || 'SEQTA helper returned no data. Is Python + requests/bs4 installed?'))
      }
    })
  })
}

function pipInstall(): Promise<void> {
  return new Promise((resolve) => {
    const cmd = resolveCommand(getSettings().seqta.python || 'python')
    const child = spawn(cmd, ['-m', 'pip', 'install', '--user', 'requests', 'beautifulsoup4'], {
      windowsHide: true
    })
    child.on('error', () => resolve())
    child.on('close', () => resolve())
  })
}

/** Run the Python helper; if it reports a missing dependency, pip-install and retry once. */
async function runHelperWithAutoDeps(args: string[]): Promise<any> {
  let info = await runHelper(args)
  if (info && !info.ok && /missing dependency|no module/i.test(info.error || '')) {
    await pipInstall()
    info = await runHelper(args)
  }
  return info
}

async function apiRaw(path: string, body: unknown = {}, method = 'POST'): Promise<any> {
  const res = await fetch(`${identity!.base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Cookie: `JSESSIONID=${identity!.cookie}`
    },
    body: method === 'GET' ? undefined : JSON.stringify(body)
  })
  const json = await res.json()
  return json
}
const payload = async (path: string, body?: unknown) => (await apiRaw(path, body)).payload

/** Validate a cookie by hitting /login; returns identity fields or null. */
async function validate(cookie: string): Promise<Identity | null> {
  try {
    const res = await fetch(`${base()}/seqta/student/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: `JSESSIONID=${cookie}`
      },
      body: JSON.stringify({ mode: 'normal', query: null, redirect_url: `${base()}/` })
    })
    const p = (await res.json())?.payload
    if (!p?.personUUID) return null
    const prev = getSettings().seqta
    return {
      cookie,
      base: base(),
      name: p.userDesc || prev.displayName || '',
      uuid: p.personUUID,
      id: p.id,
      code: p.meta?.code || ''
    }
  } catch {
    return null
  }
}

/**
 * Ensure we have a working session, acquiring one if needed.
 *
 * IMPORTANT: the dashboard fires many SEQTA calls at once. Without this
 * de-duplication each one would kick off its own SSO login, and because the
 * login clears the shared session partition they would wipe each other out and
 * hang forever. All concurrent callers share a single in-flight login.
 */
let inFlight: Promise<Identity> | null = null

export function ensure(force = false): Promise<Identity> {
  if (identity && !force) return Promise.resolve(identity)
  if (inFlight) return inFlight
  inFlight = doEnsure(force).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doEnsure(force: boolean): Promise<Identity> {
  const s = getSettings().seqta
  if (identity && !force) return identity

  // 1. Try the persisted cookie.
  if (!force && s.sessionCookie) {
    const v = await validate(s.sessionCookie)
    if (v) {
      identity = v
      return v
    }
  }

  // Fresh SSO login. Try in order of zero-dependency-ness:
  //   1) Electron's built-in browser  2) bundled Python helper  3) Puppeteer.
  if (!s.email || !s.password) {
    throw new Error('Add your SEQTA email and password in Settings → SEQTA.')
  }
  let info: any
  const errors: string[] = []
  try {
    info = await electronSsoLogin(base(), s.email, s.password)
  } catch (e1: any) {
    errors.push(`Built-in browser: ${e1.message}`)
    try {
      info = await runHelperWithAutoDeps([base(), s.email, s.password])
      if (!info?.ok) throw new Error(info?.error || 'SSO login failed.')
    } catch (e2: any) {
      errors.push(`Python: ${e2.message}`)
      try {
        info = await puppeteerLogin(base(), s.email, s.password)
      } catch (e3: any) {
        errors.push(`Puppeteer: ${e3.message}`)
        throw new Error('Could not sign in to SEQTA.\n' + errors.join('\n'))
      }
    }
  }

  const prev = getSettings().seqta
  identity = {
    cookie: info.jsessionid,
    base: base(),
    // Never downgrade a known-good name/uuid if this login didn't return one.
    name: info.name || prev.displayName || '',
    uuid: info.personUUID || prev.personUUID,
    id: info.id,
    code: info.code || ''
  }
  setSettings({
    seqta: {
      ...prev,
      mode: 'sso',
      connected: true,
      sessionCookie: identity.cookie,
      displayName: identity.name,
      personUUID: identity.uuid
    }
  })
  return identity
}

export function clear() {
  identity = null
}

export async function me(): Promise<{ name: string; code: string; uuid: string; id: number }> {
  const id = await ensure()
  return { name: id.name, code: id.code, uuid: id.uuid, id: id.id }
}

export async function photo(): Promise<string> {
  const id = await ensure()
  const res = await fetch(`${id.base}/seqta/student/photo/get?format=high&uuid=${id.uuid}`, {
    headers: { Cookie: `JSESSIONID=${id.cookie}`, 'X-Requested-With': 'XMLHttpRequest' }
  })
  if (!res.ok) throw new Error('Could not load photo')
  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

function strip(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Subject {
  code: string
  title: string
  metaclass: number
  programme: number
  /** SEQTA's own enrolment period, e.g. "2026S1". Used to tell current-year subjects from past years. */
  period: string
}

/**
 * SEQTA's /load/subjects returns EVERY period the student has ever been
 * enrolled in, not just the current one — confirmed against a real account:
 * 20 Year 7 subjects (period 2025S*) alongside just 3 Year 8 subjects
 * (2026S1). A "most common code prefix" guess would have picked the wrong
 * year. The period string sorts chronologically as plain text (YYYY then S
 * then term number), so the latest one is reliably "this year".
 */
async function subjects(): Promise<Subject[]> {
  const data = await payload('/seqta/student/load/subjects')
  const out: Subject[] = []
  const seen = new Set<number>()
  for (const period of Array.isArray(data) ? data : []) {
    for (const s of period.subjects || []) {
      if (!seen.has(s.metaclass)) {
        seen.add(s.metaclass)
        out.push({ code: s.code, title: s.title, metaclass: s.metaclass, programme: s.programme, period: period.code || '' })
      }
    }
  }
  return out
}

export function currentPeriod(subs: { period: string }[]): string {
  return subs.reduce((max, s) => (s.period > max ? s.period : max), '')
}

/** Public listing for UI pickers ("import from this subject", the Courses tab). */
export async function subjectsList(): Promise<{ code: string; title: string; period: string; current: boolean }[]> {
  await ensure()
  const subs = await subjects()
  const latest = currentPeriod(subs)
  return subs.map((s) => ({ code: s.code, title: s.title, period: s.period, current: s.period === latest }))
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
function weekStart() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}
function weekEnd() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 6)
  return ymd(d)
}

export async function timetable(from?: string, until?: string): Promise<SeqtaLesson[]> {
  const id = await ensure()
  const data = await payload('/seqta/student/load/timetable', {
    from: from || ymd(new Date()),
    until: until || from || ymd(new Date()),
    student: id.id
  })
  const items: any[] = data?.items || []
  return items
    .map((l) => ({
      description: l.description || 'Lesson',
      staff: l.staff || '',
      room: l.room || '',
      from: (l.from || '').slice(0, 5),
      until: (l.until || '').slice(0, 5),
      code: l.code || '',
      colour: l.colour,
      day: l.date || ''
    }))
    .sort((a, b) => (a.day + a.from > b.day + b.from ? 1 : -1))
}

export async function timetableWeek(): Promise<SeqtaLesson[]> {
  return timetable(weekStart(), weekEnd())
}

export async function assessments(): Promise<SeqtaAssessment[]> {
  const id = await ensure()
  const subs = await subjects()
  const results = await Promise.all(
    subs.map((s) =>
      payload('/seqta/student/assessment/list/upcoming', {
        student: id.id,
        metaclass: s.metaclass,
        programme: s.programme
      })
        .then((p: any) => (Array.isArray(p) ? p : []).map((a: any) => ({ ...a, _subject: s.title })))
        .catch(() => [])
    )
  )
  const flat = results.flat()
  return flat
    .map((a: any) => ({
      id: a.id,
      title: a.title || 'Assessment',
      subject: a._subject || a.subject || '',
      code: a.code || '',
      due: a.due || '',
      status: a.status || ''
    }))
    .sort((a, b) => (a.due > b.due ? 1 : -1))
}

export async function notices(date?: string): Promise<SeqtaNotice[]> {
  await ensure()
  const data = await payload('/seqta/student/load/notices', { date: date || ymd(new Date()) })
  const items: any[] = Array.isArray(data) ? data : []
  return items.map((n, i) => ({
    id: i,
    title: (strip(n.contents || '').split('\n').find((l: string) => l.trim()) || 'Notice').slice(0, 90),
    label: n.label_title || 'General',
    staff: '',
    content: strip(n.contents || ''),
    colour: n.colour
  }))
}

export async function homework(): Promise<SeqtaHomeworkGroup[]> {
  await ensure()
  const data = await payload('/seqta/student/dashlet/summary/homework')
  const items: any[] = Array.isArray(data) ? data : []
  return items
    .map((s) => ({ subject: s.title || 'Subject', items: (s.items || []).map((it: string) => strip(it)).filter(Boolean) }))
    .filter((g) => g.items.length)
}

export async function grades(): Promise<{ grades: SeqtaGrade[]; averages: SeqtaSubjectAverage[]; overall: number | null }> {
  const id = await ensure()
  const subs = await subjects()
  const all: SeqtaGrade[] = []
  await Promise.all(
    subs.map(async (s) => {
      const data = await payload('/seqta/student/assessment/list/past', {
        programme: s.programme,
        metaclass: s.metaclass,
        student: id.id
      }).catch(() => null)
      const syllabus = data?.syllabus || (Array.isArray(data) ? data : [])
      for (const syl of syllabus) {
        for (const a of syl.assessments || []) {
          const crits = (a.criteria || []).map((c: any) => Number(c.percentage)).filter((n: number) => !isNaN(n))
          const pct = crits.length ? Math.round(crits.reduce((x: number, y: number) => x + y, 0) / crits.length) : null
          all.push({ subject: s.title, title: a.title || 'Assessment', due: a.due || '', status: a.status || '', percentage: pct })
        }
      }
    })
  )
  const bySubject = new Map<string, number[]>()
  for (const g of all) if (g.percentage != null) bySubject.set(g.subject, [...(bySubject.get(g.subject) || []), g.percentage])
  const averages: SeqtaSubjectAverage[] = subs.map((s) => {
    const vals = bySubject.get(s.title) || []
    return { subject: s.title, average: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, count: vals.length }
  })
  const allVals = [...bySubject.values()].flat()
  const overall = allVals.length ? Math.round(allVals.reduce((a, b) => a + b, 0) / allVals.length) : null
  return { grades: all.sort((a, b) => (a.due < b.due ? 1 : -1)), averages, overall }
}

export async function messages(limit = 25): Promise<SeqtaMessage[]> {
  await ensure()
  const data = await payload('/seqta/student/load/message', {
    action: 'list', label: 'inbox', offset: 0, limit,
    sortBy: 'date', sortOrder: 'desc', searchValue: '', datetimeUntil: null
  })
  const msgs: any[] = data?.messages || (Array.isArray(data) ? data : [])
  return msgs.map((m) => ({
    id: m.id,
    subject: m.subject || '(no subject)',
    sender: m.sender || '',
    date: (m.date || '').slice(0, 16).replace('T', ' '),
    read: !!m.read
  }))
}

export async function reports(): Promise<SeqtaReport[]> {
  await ensure()
  const data = await payload('/seqta/student/load/reports')
  const items: any[] = Array.isArray(data) ? data : []
  return items.map((r) => ({
    uuid: r.uuid,
    types: r.types || 'Report',
    terms: r.terms || '',
    year: r.year || '',
    date: (r.created_date || '').slice(0, 10)
  }))
}

export async function openReport(uuid: string): Promise<void> {
  const id = await ensure()
  const res = await fetch(`${id.base}/seqta/student/files/stream?uuid=${uuid}`, {
    headers: { Cookie: `JSESSIONID=${id.cookie}` }
  })
  if (!res.ok) throw new Error('Could not download report.')
  const buf = Buffer.from(await res.arrayBuffer())
  const file = join(tmpdir(), `seqta-report-${uuid}.pdf`)
  writeFileSync(file, buf)
  await shell.openPath(file)
}

export interface LessonContent {
  term: string
  week: string
  title: string
  notes: string
  files: string[]
}

export interface CourseContent {
  subject: string
  code: string
  files: string[]
  lessons: LessonContent[]
  text: string
}

/**
 * Course/lesson content for a subject — used to import directly into a
 * Notebook or a Flashcards deck without leaving SchoolMod, and to browse
 * lesson-by-lesson in the Courses tab. Matches by code/title substring so
 * "humanities" or "8HU23" both work.
 */
export async function courseContent(subjectKeyword: string): Promise<CourseContent[]> {
  await ensure()
  const kw = subjectKeyword.trim().toLowerCase()
  const subs = (await subjects()).filter(
    (s) => !kw || s.title.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw)
  )
  if (!subs.length) throw new Error(`No subject matching "${subjectKeyword}". Call seqta_subjects (or check Settings → SEQTA) for exact names.`)

  const results: CourseContent[] = []
  for (const s of subs) {
    const data = await payload('/seqta/student/load/courses', {
      programme: String(s.programme),
      metaclass: String(s.metaclass)
    }).catch(() => null)
    if (!data) continue

    const files: string[] = (data.cf || []).map((f: any) => f.filename).filter(Boolean)
    const dWeeks: any[] = data.d || []
    const wWeeks: any[] = data.w || []
    const lessons: LessonContent[] = []
    for (let i = 0; i < dWeeks.length; i++) {
      const week = dWeeks[i]
      const content = wWeeks[i]
      const items = Array.isArray(content) ? content : content ? [content] : []
      for (const item of items) {
        const title = item?.t || ''
        const notes = item?.n ? String(item.n).replace(/<[^>]+>/g, ' ').trim() : ''
        const lessonFiles: string[] = (item?.r || []).map((f: any) => f.filename).filter(Boolean)
        if (!title && !notes && !lessonFiles.length) continue
        lessons.push({ term: String(week?.t ?? '?'), week: String(week?.w ?? '?'), title, notes, files: lessonFiles })
      }
    }
    const text =
      lessons.map((l) => [`Term ${l.term} Week ${l.week}: ${l.title}`, l.notes].filter(Boolean).join('\n')).join('\n\n') ||
      '(No lesson plan content published yet for this subject.)'
    results.push({ subject: s.title, code: s.code, files, lessons, text })
  }
  if (!results.length) throw new Error(`Found the subject but could not load its course content.`)
  return results
}

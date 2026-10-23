/**
 * Bell times, ported from the original SchoolMod repo (Schools/Trinity College/bell.html).
 * Structured as school profiles so other schools can be added the way the old
 * repo's Schools/ folder intended.
 */

export interface BellPeriod {
  name: string
  start: string // HH:MM
  end: string // HH:MM
}

export interface SchoolProfile {
  id: string
  name: string
  /** Schedule per weekday (0=Sun … 6=Sat). Missing day = no school. */
  week: Record<number, BellPeriod[] | undefined>
}

const TRINITY_STANDARD: BellPeriod[] = [
  { name: 'Pastoral Care (PCG)', start: '08:30', end: '08:40' },
  { name: 'Period 1', start: '08:40', end: '09:35' },
  { name: 'Period 2', start: '09:35', end: '10:30' },
  { name: 'Recess', start: '10:30', end: '10:55' },
  { name: 'Travel to Class', start: '10:55', end: '11:00' },
  { name: 'Period 3', start: '11:00', end: '11:50' },
  { name: 'Period 4', start: '11:50', end: '12:45' },
  { name: 'Lunch', start: '12:45', end: '13:10' },
  { name: 'Travel to Class', start: '13:10', end: '13:15' },
  { name: 'Period 5', start: '13:15', end: '14:10' },
  { name: 'Period 6', start: '14:10', end: '15:05' }
]

const TRINITY_TUESDAY: BellPeriod[] = [
  { name: 'Pastoral Care (PCG)', start: '08:30', end: '09:20' },
  { name: 'Period 1', start: '09:20', end: '10:10' },
  { name: 'Period 2', start: '10:10', end: '11:00' },
  { name: 'Recess', start: '11:00', end: '11:25' },
  { name: 'Travel to Class', start: '11:25', end: '11:30' },
  { name: 'Period 3', start: '11:30', end: '12:20' },
  { name: 'Period 4', start: '12:20', end: '13:05' },
  { name: 'Lunch', start: '13:05', end: '13:30' },
  { name: 'Travel to Class', start: '13:30', end: '13:35' },
  { name: 'Period 5', start: '13:35', end: '14:20' },
  { name: 'Period 6', start: '14:20', end: '15:05' }
]

const TRINITY_FRIDAY: BellPeriod[] = [
  { name: 'Pastoral Care (PCG)', start: '08:30', end: '08:40' },
  { name: 'Period 1', start: '08:40', end: '09:24' },
  { name: 'Period 2', start: '09:24', end: '10:08' },
  { name: 'Period 3', start: '10:08', end: '10:52' },
  { name: 'Recess', start: '10:52', end: '11:17' },
  { name: 'Travel to Class', start: '11:17', end: '11:22' },
  { name: 'Period 4', start: '11:22', end: '12:06' },
  { name: 'Period 5', start: '12:06', end: '12:50' },
  { name: 'Lunch', start: '12:50', end: '13:15' },
  { name: 'Travel to Class', start: '13:15', end: '13:20' },
  { name: 'Period 6 (Sport 1)', start: '13:20', end: '14:10' },
  { name: 'Period 7 (Sport 2)', start: '14:10', end: '15:05' }
]

export const SCHOOLS: SchoolProfile[] = [
  {
    id: 'trinity',
    name: 'Trinity College WA',
    week: {
      1: TRINITY_STANDARD, // Mon
      2: TRINITY_TUESDAY, // Tue
      3: TRINITY_STANDARD, // Wed
      4: TRINITY_STANDARD, // Thu
      5: TRINITY_FRIDAY // Fri
    }
  }
]

export const getSchool = (id: string) => SCHOOLS.find((s) => s.id === id) || SCHOOLS[0]

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** "08:40" -> "8:40 am", matching the bell page's formatTimeStr. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Seconds -> "MM:SS". Minutes are not clamped to 60 — a 55-minute period reads "54:12". */
export function mmss(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export type BellPhase = 'weekend' | 'before' | 'during' | 'between' | 'after'

export interface BellState {
  schedule: BellPeriod[]
  current: BellPeriod | null
  next: BellPeriod | null
  /** Minutes remaining in the current period (or until the next one starts). */
  minutesLeft: number | null
  /** Seconds remaining to the same target — drives the live MM:SS countdown. */
  secondsLeft: number | null
  /** 0–1 progress through the current period. */
  progress: number
  dayOff: boolean
  phase: BellPhase
  /** Big headline, e.g. "Period 3", "Before School", "School Ended". */
  status: string
  /** Sub-label, e.g. "11:00 am - 11:50 am" or "First Bell at 8:30 am". */
  rangeLabel: string
  /** e.g. "Period 4 (11:50 am)" or "End of School Day". */
  nextLabel: string
}

const WEEKEND_NEXT = 'Monday PCG (8:30 am)'

/**
 * Work out where we are in the school day.
 *
 * Ported from the SchoolMod bell page (Schools/Trinity College/bell.html) with
 * two deliberate differences:
 *
 *  - The page subtracts 2000ms from the clock before comparing. That makes the
 *    countdown run two seconds behind real time, so it's dropped here.
 *  - The page breaks out of its scan on the first period that starts later,
 *    which means a gap between periods would fall through to "School Ended".
 *    Trinity's schedules are contiguous so it never fires there, but this
 *    version reports a real 'between' phase rather than relying on that.
 */
export function bellState(schoolId: string, now = new Date()): BellState {
  const school = getSchool(schoolId)
  const schedule = school.week[now.getDay()]
  if (!schedule || !schedule.length) {
    return {
      schedule: [],
      current: null,
      next: null,
      minutesLeft: null,
      secondsLeft: null,
      progress: 0,
      dayOff: true,
      phase: 'weekend',
      status: "School's Out!",
      rangeLabel: 'Enjoy your break',
      nextLabel: WEEKEND_NEXT
    }
  }

  const secsNow = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  const mins = secsNow / 60
  let current: BellPeriod | null = null
  let next: BellPeriod | null = null
  for (const p of schedule) {
    if (mins >= toMin(p.start) && mins < toMin(p.end)) current = p
    if (mins < toMin(p.start) && !next) next = p
  }

  const target = current ? current.end : next ? next.start : null
  const secondsLeft = target ? Math.max(0, toMin(target) * 60 - secsNow) : null
  const minutesLeft = secondsLeft == null ? null : Math.ceil(secondsLeft / 60)
  const progress = current
    ? (mins - toMin(current.start)) / (toMin(current.end) - toMin(current.start))
    : 0

  const phase: BellPhase = current ? 'during' : !next ? 'after' : current === null && mins < toMin(schedule[0].start) ? 'before' : 'between'

  let status: string
  let rangeLabel: string
  if (phase === 'during') {
    status = current!.name
    rangeLabel = `${formatTime(current!.start)} - ${formatTime(current!.end)}`
  } else if (phase === 'before') {
    status = 'Before School'
    rangeLabel = `First Bell at ${formatTime(schedule[0].start)}`
  } else if (phase === 'between') {
    status = 'Between classes'
    rangeLabel = `Next bell at ${formatTime(next!.start)}`
  } else {
    status = 'School Ended'
    rangeLabel = 'See you tomorrow!'
  }

  const nextLabel = next
    ? `${next.name} (${formatTime(next.start)})`
    : phase === 'during'
      ? 'End of School Day'
      : WEEKEND_NEXT

  return { schedule, current, next, minutesLeft, secondsLeft, progress, dayOff: false, phase, status, rangeLabel, nextLabel }
}

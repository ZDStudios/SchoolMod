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

export interface BellState {
  schedule: BellPeriod[]
  current: BellPeriod | null
  next: BellPeriod | null
  /** Minutes remaining in the current period (or until the next one starts). */
  minutesLeft: number | null
  /** 0–1 progress through the current period. */
  progress: number
  dayOff: boolean
}

/** Work out where we are in the school day. */
export function bellState(schoolId: string, now = new Date()): BellState {
  const school = getSchool(schoolId)
  const schedule = school.week[now.getDay()]
  if (!schedule || !schedule.length) {
    return { schedule: [], current: null, next: null, minutesLeft: null, progress: 0, dayOff: true }
  }
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  let current: BellPeriod | null = null
  let next: BellPeriod | null = null
  for (const p of schedule) {
    const s = toMin(p.start)
    const e = toMin(p.end)
    if (mins >= s && mins < e) current = p
    if (mins < s && !next) next = p
  }
  const minutesLeft = current
    ? Math.ceil(toMin(current.end) - mins)
    : next
      ? Math.ceil(toMin(next.start) - mins)
      : null
  const progress = current
    ? (mins - toMin(current.start)) / (toMin(current.end) - toMin(current.start))
    : 0
  return { schedule, current, next, minutesLeft, progress, dayOff: false }
}

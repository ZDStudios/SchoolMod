import { SeqtaLesson, SeqtaAssessment } from '../../shared/types'

/**
 * Build an iCalendar (.ics) file from the timetable and upcoming assessments,
 * so a student can subscribe to their school week in Google/Apple/Outlook
 * Calendar alongside everything else in their life.
 *
 * Written by hand rather than pulling a library: the spec surface we need is
 * small, and RFC 5545 has two gotchas that are easy to miss — CRLF line
 * endings are mandatory, and commas/semicolons/backslashes inside text fields
 * must be escaped.
 */

function esc(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Local wall-clock stamp — deliberately floating (no Z) so it shows at the school's time, whatever the device timezone. */
function localStamp(dateISO: string, hhmm: string): string {
  const [h, m] = (hhmm || '00:00').split(':')
  return `${dateISO.replace(/-/g, '')}T${(h || '00').padStart(2, '0')}${(m || '00').padStart(2, '0')}00`
}

function utcNow(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Fold long lines to 75 octets as the spec requires; unfolded lines break some parsers. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export function buildIcs(lessons: SeqtaLesson[], assessments: SeqtaAssessment[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SchoolMod//Timetable//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SchoolMod'
  ]
  const stamp = utcNow()

  lessons.forEach((l, i) => {
    if (!l.day || !l.from || !l.until) return
    lines.push(
      'BEGIN:VEVENT',
      `UID:schoolmod-lesson-${l.day}-${i}@schoolmod`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${localStamp(l.day, l.from)}`,
      `DTEND:${localStamp(l.day, l.until)}`,
      fold(`SUMMARY:${esc(l.description)}`),
      fold(`DESCRIPTION:${esc([l.code, l.staff].filter(Boolean).join(' · '))}`),
      fold(`LOCATION:${esc(l.room)}`),
      'END:VEVENT'
    )
  })

  assessments.forEach((a, i) => {
    if (!a.due) return
    const d = a.due.replace(/-/g, '')
    // All-day event on the due date. DTEND is exclusive, so add a day.
    const next = new Date(a.due + 'T00:00:00')
    next.setDate(next.getDate() + 1)
    lines.push(
      'BEGIN:VEVENT',
      `UID:schoolmod-assessment-${a.id}-${i}@schoolmod`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
      fold(`SUMMARY:${esc(`Due: ${a.title}`)}`),
      fold(`DESCRIPTION:${esc([a.subject, a.code, a.status].filter(Boolean).join(' · '))}`),
      'END:VEVENT'
    )
  })

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

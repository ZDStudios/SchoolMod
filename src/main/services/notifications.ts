import { Notification, BrowserWindow } from 'electron'
import { getSettings } from '../store'
import { bellState } from '../../shared/bells'

/**
 * Desktop reminders: a nudge before each period starts, and a heads-up for
 * assessments due today/tomorrow.
 *
 * Everything is de-duplicated by a per-day key so a reminder fires at most
 * once — the tick runs every 30s, so without that you'd get spammed for the
 * whole lead-in window.
 */

let bellTimer: NodeJS.Timeout | null = null
let assessmentTimer: NodeJS.Timeout | null = null
const fired = new Set<string>()
let lastDay = ''

const today = () => new Date().toISOString().slice(0, 10)

function once(key: string, fn: () => void) {
  // Reset the whole ledger when the date rolls over.
  const day = today()
  if (day !== lastDay) {
    fired.clear()
    lastDay = day
  }
  const k = `${day}:${key}`
  if (fired.has(k)) return
  fired.add(k)
  fn()
}

function show(title: string, body: string, getWindow: () => BrowserWindow | null) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  n.on('click', () => {
    const w = getWindow()
    if (w) {
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    }
  })
  n.show()
}

function checkBells(getWindow: () => BrowserWindow | null) {
  const s = getSettings()
  if (!s.notifications.enabled || !s.notifications.bells) return
  const st = bellState('trinity')
  if (st.dayOff || !st.next || st.minutesLeft == null) return

  // Only warn while we're inside the lead-in window and NOT mid-period
  // (mid-period, minutesLeft counts down to the end, not to the next start).
  const lead = Math.max(1, s.notifications.bellLeadMinutes || 5)
  if (st.current) return
  if (st.minutesLeft > lead || st.minutesLeft < 0) return

  once(`bell:${st.next.name}:${st.next.start}`, () =>
    show(
      `${st.next!.name} starts in ${st.minutesLeft} min`,
      `${st.next!.start} – ${st.next!.end}`,
      getWindow
    )
  )
}

async function checkAssessments(getWindow: () => BrowserWindow | null) {
  const s = getSettings()
  if (!s.notifications.enabled || !s.notifications.assessments || !s.seqta.connected) return
  try {
    const seqta = await import('./seqta')
    const items = await seqta.assessments()
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
    const todayStr = today()
    for (const a of items) {
      if (a.due === todayStr) {
        once(`due-today:${a.id}`, () => show('Due today', `${a.title} — ${a.subject}`, getWindow))
      } else if (a.due === tomorrow) {
        once(`due-tomorrow:${a.id}`, () => show('Due tomorrow', `${a.title} — ${a.subject}`, getWindow))
      }
    }
  } catch {
    /* offline or session expired — try again next cycle */
  }
}

export function startNotifications(getWindow: () => BrowserWindow | null) {
  stopNotifications()
  // Bells are cheap and local, so poll often. Assessments hit the network, so
  // poll every 30 minutes instead.
  bellTimer = setInterval(() => checkBells(getWindow), 30_000)
  assessmentTimer = setInterval(() => checkAssessments(getWindow), 30 * 60_000)
  setTimeout(() => checkAssessments(getWindow), 20_000)
}

export function stopNotifications() {
  if (bellTimer) clearInterval(bellTimer)
  if (assessmentTimer) clearInterval(assessmentTimer)
  bellTimer = assessmentTimer = null
}

/** Fire a test notification so the user can confirm the OS is letting them through. */
export function testNotification(getWindow: () => BrowserWindow | null) {
  show('SchoolMod notifications are on', "You'll get a nudge before class and when work is due.", getWindow)
  return { ok: true }
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  BookOpen,
  Layers,
  CalendarDays,
  Clock,
  FileText,
  ArrowRight,
  Users,
  CalendarClock,
  BarChart3,
  Mail,
  Megaphone
} from 'lucide-react'
import { StatCard } from '../components/ui'
import { FocusTimer, Scratchpad, TodoList, DailyBrief, QuoteCard, BellTimes, StudyStats } from '../components/widgets'
import { useApp } from '../store/app'
import { call, fmtDate, daysUntil, friendlyName } from '../lib/utils'
import type { SeqtaLesson, SeqtaAssessment, SeqtaNotice, Deck, Notebook } from '../../../shared/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const settings = useApp((s) => s.settings)
  const nav = useNavigate()
  const [lessons, setLessons] = useState<SeqtaLesson[]>([])
  const [assessments, setAssessments] = useState<SeqtaAssessment[]>([])
  const [decks, setDecks] = useState<Deck[]>([])
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [notices, setNotices] = useState<SeqtaNotice[]>([])
  const [unread, setUnread] = useState<number | null>(null)
  const [overall, setOverall] = useState<number | null>(null)

  const seqtaOn = !!settings?.seqta.connected
  const name = friendlyName(settings?.seqta.displayName, 'there').split(' ')[0]

  useEffect(() => {
    call(window.api.decks.list()).then(setDecks).catch(() => {})
    call(window.api.notebooks.list()).then(setNotebooks).catch(() => {})
    if (seqtaOn) {
      call(window.api.seqta.timetable()).then(setLessons).catch(() => {})
      call(window.api.seqta.assessments()).then(setAssessments).catch(() => {})
      call(window.api.seqta.notices()).then(setNotices).catch(() => {})
      call(window.api.seqta.messages()).then((m) => setUnread(m.filter((x) => !x.read).length)).catch(() => {})
      call(window.api.seqta.grades()).then((g) => setOverall(g.overall)).catch(() => {})
    }
  }, [seqtaOn])

  const dueCards = decks.reduce((n, d) => n + d.cards.filter((c) => c.due <= Date.now() || c.repetitions === 0).length, 0)
  const sorted = [...assessments].sort((a, b) => (a.due > b.due ? 1 : -1))
  const upcoming = sorted.filter((a) => (daysUntil(a.due) ?? -1) >= 0)
  const overdue = sorted.filter((a) => (daysUntil(a.due) ?? 0) < 0)
  // Show upcoming if there is any; otherwise still surface overdue work.
  const soonAssessments = (upcoming.length ? upcoming : overdue).slice(0, 4)
  const nextDue = upcoming[0]
  const nextDueDays = nextDue ? daysUntil(nextDue.due) : null
  const nextDueLabel = nextDue
    ? nextDueDays === 0
      ? 'Today'
      : `${nextDueDays}d`
    : overdue.length
      ? `${overdue.length} late`
      : '—'
  const now = new Date()
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const nextLesson = lessons.find((l) => l.from >= nowHM) || null

  const briefContext = () => {
    const parts: string[] = []
    if (lessons.length) parts.push(`Today's lessons: ${lessons.map((l) => `${l.description} (${l.from})`).join(', ')}.`)
    else parts.push('No lessons scheduled today.')
    if (soonAssessments.length) parts.push(`Assessments due soon: ${soonAssessments.map((a) => `${a.title} (${a.subject}) due ${a.due}`).join('; ')}.`)
    if (dueCards) parts.push(`${dueCards} flashcards are due for review.`)
    return parts.join('\n')
  }

  const actions = [
    { label: 'Ask the assistant', icon: Sparkles, to: '/assistant' },
    { label: 'New notebook', icon: BookOpen, to: '/notebooks' },
    { label: 'Make flashcards', icon: Layers, to: '/flashcards' },
    { label: 'Open Teams', icon: Users, onClick: () => window.api.microsoft.openApp('teams') }
  ]

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting()}, {name} 👋
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-dim)' }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          {nextLesson && ` · Next up: ${nextLesson.description} at ${nextLesson.from}`}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard label="Lessons today" value={seqtaOn ? lessons.length : '—'} icon={<Clock size={16} />} tone="accent" />
        <StatCard label="Next due" value={nextDueLabel} icon={<CalendarClock size={16} />} />
        <StatCard label="Average" value={overall != null ? `${overall}%` : seqtaOn ? '…' : '—'} icon={<BarChart3 size={16} />} tone="accent" />
        <StatCard label="Unread mail" value={unread ?? (seqtaOn ? '…' : '—')} icon={<Mail size={16} />} />
      </div>

      {/* Brief + quote */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <DailyBrief context={briefContext} />
        </div>
        <QuoteCard />
      </div>

      {/* Interactive widgets */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <BellTimes />
        <FocusTimer />
        <TodoList />
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Scratchpad />
        </div>
        <StudyStats />
      </div>

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => (a.onClick ? a.onClick() : nav(a.to!))}
            className="card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <a.icon size={18} />
            </div>
            <span className="text-sm font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><CalendarDays size={17} /> Today's schedule</h2>
            <button className="text-xs font-medium text-[var(--accent)]" onClick={() => nav('/seqta')}>View all</button>
          </div>
          {!seqtaOn ? (
            <ConnectPrompt text="Connect SEQTA to see your timetable." onClick={() => nav('/settings')} />
          ) : lessons.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              {[0, 6].includes(new Date().getDay()) ? 'No lessons — it\'s the weekend 🎉' : 'No lessons scheduled today 🎉'}
            </p>
          ) : (
            <div className="space-y-2">
              {lessons.slice(0, 5).map((l, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1 self-stretch rounded-full" style={{ background: l.colour || 'var(--accent)' }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{l.description}</p>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{l.room}</p>
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>{l.from}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><FileText size={17} /> Coming up</h2>
            <button className="text-xs font-medium text-[var(--accent)]" onClick={() => nav('/seqta')}>View all</button>
          </div>
          {!seqtaOn ? (
            <ConnectPrompt text="Connect SEQTA to track assessments." onClick={() => nav('/settings')} />
          ) : soonAssessments.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>Nothing outstanding — you're all clear.</p>
          ) : (
            <div className="space-y-2.5">
              {soonAssessments.map((a) => {
                const d = daysUntil(a.due)
                return (
                  <div key={a.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{a.subject}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${d !== null && d <= 3 ? 'text-red-500' : ''}`} style={{ color: d !== null && d <= 3 ? undefined : 'var(--text-dim)' }}>
                      {d !== null && d < 0 ? `overdue · ${fmtDate(a.due)}` : d === 0 ? 'today' : fmtDate(a.due)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {seqtaOn && notices.length > 0 && (
        <div className="card mt-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><Megaphone size={17} /> Today's notices</h2>
            <button className="text-xs font-medium text-[var(--accent)]" onClick={() => nav('/seqta')}>View all</button>
          </div>
          <div className="space-y-3">
            {notices.slice(0, 3).map((n) => (
              <div key={n.id}>
                <div className="flex items-center gap-2">
                  {n.label && (
                    <span className="chip" style={{ background: (n.colour || 'var(--accent)') + '22', color: n.colour || 'var(--accent)' }}>
                      {n.label}
                    </span>
                  )}
                  <p className="truncate text-sm font-medium">{n.title}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--text-dim)' }}>{n.content.slice(0, 180)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectPrompt({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-xl border border-dashed px-4 py-3 text-sm transition hover:border-[var(--accent)]" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
      {text}
      <ArrowRight size={15} />
    </button>
  )
}

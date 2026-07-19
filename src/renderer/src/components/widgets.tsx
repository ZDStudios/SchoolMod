import { useEffect, useRef, useState } from 'react'
import { Timer, Play, Pause, RotateCcw, Plus, Check, Trash2, Sparkles, StickyNote, Bell } from 'lucide-react'
import { useLocalState } from '../lib/hooks'
import { bellState } from '../../../shared/bells'
import { Markdown } from '../lib/md'
import { call } from '../lib/utils'
import type { ChatMessage } from '../../../shared/types'

const todayKey = () => new Date().toISOString().slice(0, 10)

/* ---------------- Focus timer (Pomodoro) ---------------- */
export function FocusTimer() {
  const [minutes, setMinutes] = useLocalState('sm.focus.len', 25)
  const [left, setLeft] = useState(minutes * 60)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useLocalState<Record<string, number>>('sm.focus.log', {})
  const tick = useRef<any>(null)

  useEffect(() => {
    if (!running) return
    tick.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false)
          setLog((prev) => ({ ...prev, [todayKey()]: (prev[todayKey()] || 0) + minutes }))
          return 0
        }
        return l - 1
      })
    }, 1000)
    return () => clearInterval(tick.current)
  }, [running, minutes])

  useEffect(() => setLeft(minutes * 60), [minutes])

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const todayMins = log[todayKey()] || 0
  const pct = 1 - left / (minutes * 60)

  return (
    <div className="card flex flex-col p-5">
      <div className="mb-1 flex items-center gap-2">
        <Timer size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">Focus timer</h3>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-dim)' }}>{todayMins} min today</span>
      </div>
      <div className="relative mx-auto my-2 grid h-28 w-28 place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${pct * 276} 276`} />
        </svg>
        <span className="font-mono text-2xl font-bold tabular-nums">{mm}:{ss}</span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <button className="btn btn-primary px-3" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="btn px-3" onClick={() => { setRunning(false); setLeft(minutes * 60) }}>
          <RotateCcw size={15} />
        </button>
        <select className="input !w-auto !py-1.5" value={minutes} onChange={(e) => setMinutes(+e.target.value)}>
          {[15, 25, 45, 50].map((m) => <option key={m} value={m}>{m}m</option>)}
        </select>
      </div>
    </div>
  )
}

/* ---------------- Quick scratchpad ---------------- */
export function Scratchpad() {
  const [text, setText] = useLocalState('sm.scratchpad', '')
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-2 flex items-center gap-2">
        <StickyNote size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">Scratchpad</h3>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-dim)' }}>auto-saved</span>
      </div>
      <textarea
        className="input flex-1 resize-none text-sm"
        style={{ minHeight: 120 }}
        placeholder="Jot anything — ideas, reminders, working out…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  )
}

/* ---------------- To-do list ---------------- */
interface Todo { id: string; text: string; done: boolean; due?: string }
export function TodoList() {
  const [todos, setTodos] = useLocalState<Todo[]>('sm.todos', [])
  const [input, setInput] = useState('')
  const uid = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const add = () => {
    if (!input.trim()) return
    setTodos((t) => [{ id: uid(), text: input.trim(), done: false }, ...t])
    setInput('')
  }
  const open = todos.filter((t) => !t.done)
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-2 flex items-center gap-2">
        <Check size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">To-do</h3>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-dim)' }}>{open.length} open</span>
      </div>
      <div className="mb-2 flex gap-2">
        <input className="input" placeholder="Add a task…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn btn-primary px-3" onClick={add}><Plus size={15} /></button>
      </div>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {todos.length === 0 && <p className="py-4 text-center text-xs" style={{ color: 'var(--text-dim)' }}>Nothing yet — add your first task.</p>}
        {todos.map((t) => (
          <div key={t.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--bg)' }}>
            <button onClick={() => setTodos((ts) => ts.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))}
              className="grid h-4 w-4 shrink-0 place-items-center rounded border" style={{ borderColor: 'var(--accent)', background: t.done ? 'var(--accent)' : 'transparent' }}>
              {t.done && <Check size={11} className="text-white" />}
            </button>
            <span className={`flex-1 text-sm ${t.done ? 'line-through opacity-50' : ''}`}>{t.text}</span>
            <button onClick={() => setTodos((ts) => ts.filter((x) => x.id !== t.id))} className="opacity-0 transition group-hover:opacity-100">
              <Trash2 size={13} className="text-red-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Daily AI brief ---------------- */
export function DailyBrief({ context }: { context: () => string }) {
  const [brief, setBrief] = useLocalState<{ date: string; text: string }>('sm.brief', { date: '', text: '' })
  const [busy, setBusy] = useState(false)
  const fresh = brief.date === todayKey() && brief.text
  const generate = async () => {
    setBusy(true)
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a friendly study coach. Write a short, motivating morning brief (4-6 lines) from the student\'s day data. Be specific and encouraging. Markdown, no headings.' },
        { role: 'user', content: context() || 'No SEQTA data available. Give a general encouraging study tip for today.' }
      ]
      const text = await call(window.api.claude.chat(messages))
      setBrief({ date: todayKey(), text })
    } catch (e: any) {
      setBrief({ date: todayKey(), text: `⚠️ ${e.message}` })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">Your daily brief</h3>
        <button className="btn btn-ghost ml-auto px-2 py-1 text-xs" onClick={generate} disabled={busy}>
          {busy ? 'Thinking…' : fresh ? 'Refresh' : 'Generate'}
        </button>
      </div>
      {fresh ? (
        <Markdown text={brief.text} className="text-sm" />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          {busy ? 'Writing your brief…' : 'Get an AI summary of your day — lessons, what\'s due, and a nudge to get going.'}
        </p>
      )}
    </div>
  )
}

/* ---------------- Bell times (ported from the original SchoolMod repo) ---------------- */
export function BellTimes({ schoolId = 'trinity' }: { schoolId?: string }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000 * 15)
    return () => clearInterval(t)
  }, [])
  const s = bellState(schoolId)

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Bell size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">Bell times</h3>
        {!s.dayOff && s.minutesLeft != null && (
          <span className="chip ml-auto">
            {s.current ? `${s.minutesLeft} min left` : `starts in ${s.minutesLeft} min`}
          </span>
        )}
      </div>

      {s.dayOff ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--text-dim)' }}>No bells today — enjoy it 🎉</p>
      ) : (
        <>
          <div className="mb-3">
            <p className="text-lg font-bold">{s.current ? s.current.name : s.next ? `Up next: ${s.next.name}` : 'School day finished'}</p>
            {s.current && (
              <>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {s.current.start} – {s.current.end}
                  {s.next && ` · then ${s.next.name}`}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.progress * 100)}%`, background: 'var(--accent)' }} />
                </div>
              </>
            )}
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {s.schedule.map((p, i) => {
              const isNow = s.current?.name === p.name && s.current?.start === p.start
              return (
                <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                  style={{ background: isNow ? 'var(--accent-soft)' : 'transparent', color: isNow ? 'var(--accent)' : 'var(--text-dim)' }}>
                  <span className={isNow ? 'font-semibold' : ''}>{p.name}</span>
                  <span className="tabular-nums">{p.start}–{p.end}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- Quote of the day ---------------- */
const QUOTES = [
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['It always seems impossible until it\'s done.', 'Nelson Mandela'],
  ['Success is the sum of small efforts repeated day in and day out.', 'Robert Collier'],
  ['Don\'t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
  ['The expert in anything was once a beginner.', 'Helen Hayes'],
  ['Little by little, one travels far.', 'J.R.R. Tolkien'],
  ['Study while others are sleeping; work while others are loafing.', 'William A. Ward'],
  ['You don\'t have to be great to start, but you have to start to be great.', 'Zig Ziglar']
]
export function QuoteCard() {
  const idx = Math.floor(Date.now() / 86400000) % QUOTES.length
  const [q, who] = QUOTES[idx]
  return (
    <div className="card p-5" style={{ background: 'var(--accent)', borderColor: 'transparent' }}>
      <p className="text-sm font-medium leading-relaxed text-white">“{q}”</p>
      <p className="mt-2 text-xs text-white/80">— {who}</p>
    </div>
  )
}

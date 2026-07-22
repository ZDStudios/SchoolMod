import { useEffect, useRef, useState } from 'react'
import { Timer, Play, Pause, RotateCcw, Plus, Check, Trash2, Sparkles, StickyNote, Bell, Flame } from 'lucide-react'
import { useLocalState } from '../lib/hooks'
import { bellState, mmss, formatTime } from '../../../shared/bells'
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
  const [ringing, setRinging] = useState(false)
  const rang = useRef('')

  // One tick per second — the countdown is the whole point of the bell page.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const s = bellState(schoolId)

  // Ring when a period actually rolls over. Keyed by period end so it fires
  // once per bell, not on every re-render inside that final second.
  useEffect(() => {
    if (s.phase !== 'during' || s.secondsLeft == null || s.secondsLeft > 0) return
    const key = `${s.current?.name}@${s.current?.end}`
    if (rang.current === key) return
    rang.current = key
    setRinging(true)
    // Matches the bell page's double-ring: 1.8s shake, 1s gap, 1.8s again.
    const t = setTimeout(() => setRinging(false), 1800 * 2 + 1000)
    return () => clearTimeout(t)
  }, [s.phase, s.secondsLeft, s.current?.end])

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Bell size={17} className={ringing ? 'animate-bell-ring' : ''} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">Bell times</h3>
        {!s.dayOff && (
          <span className="chip ml-auto">
            {new Date().toLocaleDateString(undefined, { weekday: 'long' })} schedule
          </span>
        )}
      </div>

      {/* Headline block, mirroring the bell page: status, time range, countdown, next up. */}
      <div className="mb-3 rounded-xl px-4 py-3 text-center" style={{ background: 'var(--bg)' }}>
        <p className="text-sm font-semibold">{s.status}</p>
        <p className="mb-1 text-xs" style={{ color: 'var(--text-dim)' }}>{s.rangeLabel}</p>
        <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
          {s.secondsLeft == null ? '--:--' : mmss(s.secondsLeft)}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
          Next: {s.nextLabel}
        </p>
      </div>

      {s.dayOff ? (
        <p className="py-2 text-center text-sm" style={{ color: 'var(--text-dim)' }}>No bells today — enjoy it 🎉</p>
      ) : (
        <>
          {s.current && (
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.progress * 100)}%`, background: 'var(--accent)' }} />
            </div>
          )}
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {s.schedule.map((p, i) => {
              const isNow = s.current?.name === p.name && s.current?.start === p.start
              return (
                <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                  style={{ background: isNow ? 'var(--accent-soft)' : 'transparent', color: isNow ? 'var(--accent)' : 'var(--text-dim)' }}>
                  <span className={isNow ? 'font-semibold' : ''}>{p.name}</span>
                  <span className="tabular-nums">{formatTime(p.start)} – {formatTime(p.end)}</span>
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

/* ---------------- Study streak & history ---------------- */

/**
 * Turns the focus timer's log into the thing that actually keeps people
 * studying: a streak, plus a glance-able 12-week heatmap.
 *
 * The streak tolerates *today* being empty — you haven't necessarily failed
 * at 9am — so it counts back from yesterday and adds today only if it counts.
 */
export function StudyStats() {
  const [log] = useLocalState<Record<string, number>>('sm.focus.log', {})

  const dayKey = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return d.toISOString().slice(0, 10)
  }

  let streak = log[todayKey()] ? 1 : 0
  for (let back = 1; back < 400; back++) {
    if (!log[dayKey(back)]) break
    streak++
  }

  const totalMins = Object.values(log).reduce((a, b) => a + b, 0)
  const last7 = Array.from({ length: 7 }, (_, i) => log[dayKey(i)] || 0).reduce((a, b) => a + b, 0)
  // 12 weeks, oldest first, so the grid reads left-to-right like a calendar.
  const days = Array.from({ length: 84 }, (_, i) => dayKey(83 - i))
  const busiest = Math.max(1, ...days.map((d) => log[d] || 0))

  const shade = (mins: number) => {
    if (!mins) return 'var(--bg)'
    // Four steps rather than a continuous ramp — easier to read at 10px.
    const step = Math.ceil((mins / busiest) * 4)
    return `color-mix(in srgb, var(--accent) ${step * 25}%, var(--bg))`
  }

  const hrs = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`)

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">Study streak</h3>
      </div>

      <div className="mb-4 flex items-end gap-5">
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
            {streak}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {streak === 1 ? 'day' : 'days'} in a row
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold">{hrs(last7)}</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>this week</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{hrs(totalMins)}</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>all time</p>
        </div>
      </div>

      {totalMins === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Finish a session on the focus timer and your streak starts here.
        </p>
      ) : (
        <>
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {days.map((d) => (
              <div
                key={d}
                title={`${d} — ${log[d] ? hrs(log[d]) : 'nothing logged'}`}
                className="h-[10px] w-[10px] rounded-[2px]"
                style={{ background: shade(log[d] || 0), boxShadow: 'inset 0 0 0 1px var(--border)' }}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
            Last 12 weeks
          </p>
        </>
      )}
    </div>
  )
}

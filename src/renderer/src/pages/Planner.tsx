import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, Sparkles, Save } from 'lucide-react'
import { PageHeader, Empty, Spinner, ErrorBanner } from '../components/ui'
import { Markdown } from '../lib/md'
import { useApp } from '../store/app'
import { call, fmtDate, daysUntil } from '../lib/utils'
import type { SeqtaAssessment, ChatMessage } from '../../../shared/types'

export default function Planner() {
  const connected = !!useApp((s) => s.settings?.seqta.connected)
  const [items, setItems] = useState<SeqtaAssessment[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [hours, setHours] = useState(2)
  const [plan, setPlan] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!connected) return
    setLoading(true)
    call(window.api.seqta.assessments())
      .then((a) => {
        const upcoming = a.filter((x) => { const d = daysUntil(x.due); return d !== null && d >= 0 })
        setItems(upcoming)
        setPicked(new Set(upcoming.map((x) => x.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [connected])

  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const generate = async () => {
    const chosen = items.filter((i) => picked.has(i.id))
    if (!chosen.length) return
    setBusy(true)
    setErr('')
    setPlan('')
    try {
      const list = chosen.map((c) => `- ${c.title} (${c.subject}) — due ${c.due}`).join('\n')
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are an expert study planner. Build a realistic day-by-day revision schedule leading up to each due date, spreading effort sensibly and prioritising the nearest/most important. Use markdown with a heading per day. Keep tasks concrete.' },
        { role: 'user', content: `Today is ${new Date().toISOString().slice(0, 10)}. I can study about ${hours} hours per day. Plan my revision for:\n${list}` }
      ]
      setPlan(await call(window.api.claude.chat(messages)))
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!plan) return
    await window.api.saveFile('study-plan.md', plan)
  }

  if (!connected)
    return (
      <div className="p-8">
        <PageHeader title="Study Planner" icon={<CalendarRange size={20} />} />
        <Empty icon={<CalendarRange size={40} />} title="Connect SEQTA to plan around your assessments" action={<Link to="/settings" className="btn btn-primary">Go to Settings</Link>} />
      </div>
    )

  return (
    <div className="p-8">
      <PageHeader title="AI Study Planner" subtitle="Turn your upcoming assessments into a day-by-day plan" icon={<CalendarRange size={20} />} />
      <ErrorBanner message={err} />
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Pick assessments</h2>
          {loading ? (
            <Spinner size={20} />
          ) : items.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nothing upcoming — enjoy the break!</p>
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <button key={a.id} onClick={() => toggle(a.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left" style={{ background: picked.has(a.id) ? 'var(--accent-soft)' : 'var(--bg)' }}>
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded border" style={{ borderColor: 'var(--accent)', background: picked.has(a.id) ? 'var(--accent)' : 'transparent' }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{a.subject} · {fmtDate(a.due)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Hours/day</span>
            <input type="range" min={1} max={6} value={hours} onChange={(e) => setHours(+e.target.value)} className="flex-1 accent-[var(--accent)]" />
            <span className="w-6 text-center font-semibold">{hours}</span>
          </div>
          <button className="btn btn-primary mt-4 w-full" onClick={generate} disabled={busy || picked.size === 0}>
            {busy ? <Spinner size={15} /> : <Sparkles size={15} />} Generate plan
          </button>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Your plan</h2>
            {plan && <button className="btn btn-ghost px-2 py-1 text-xs" onClick={save}><Save size={13} /> Export .md</button>}
          </div>
          {busy ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-dim)' }}><Spinner size={16} /> Building your schedule…</div>
          ) : plan ? (
            <div className="max-h-[60vh] overflow-y-auto"><Markdown text={plan} /></div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Pick your assessments and generate a personalised revision timetable.</p>
          )}
        </div>
      </div>
    </div>
  )
}

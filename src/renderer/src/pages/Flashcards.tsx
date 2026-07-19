import { useEffect, useState } from 'react'
import { Layers, Plus, Sparkles, Trash2, Play, X, RotateCcw, Check } from 'lucide-react'
import { PageHeader, Empty, Spinner } from '../components/ui'
import { call } from '../lib/utils'
import type { Deck, Flashcard, ReviewGrade } from '../../../shared/types'

const dueCount = (d: Deck) => d.cards.filter((c) => c.due <= Date.now() || c.repetitions === 0).length

export default function Flashcards() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [studying, setStudying] = useState<Deck | null>(null)
  const [generating, setGenerating] = useState<Deck | null>(null)

  const load = async () => {
    setDecks(await call(window.api.decks.list()))
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    const title = prompt('Deck name', 'New deck')
    if (title === null) return
    await call(window.api.decks.create(title || 'New deck'))
    await load()
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this deck?')) return
    await window.api.decks.remove(id)
    await load()
  }

  if (loading) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  if (studying) return <StudySession deck={studying} onExit={async () => { setStudying(null); await load() }} />

  return (
    <div className="p-8">
      <PageHeader
        title="Flashcards"
        subtitle="AI-generated cards with spaced repetition, like Gizmo"
        icon={<Layers size={20} />}
        actions={
          <button className="btn btn-primary" onClick={create}>
            <Plus size={16} /> New deck
          </button>
        }
      />
      {decks.length === 0 ? (
        <Empty
          icon={<Layers size={40} />}
          title="No decks yet"
          hint="Create a deck, then let Claude generate flashcards from a topic or your notes. Review them with proven spaced repetition."
          action={<button className="btn btn-primary" onClick={create}><Plus size={16} /> New deck</button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {decks.map((d) => {
            const due = dueCount(d)
            return (
              <div key={d.id} className="card group flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div className="text-3xl">{d.emoji}</div>
                  <button onClick={() => remove(d.id)} className="opacity-0 transition group-hover:opacity-100">
                    <Trash2 size={15} className="text-red-500" />
                  </button>
                </div>
                <p className="mt-3 truncate font-semibold">{d.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {d.cards.length} card{d.cards.length === 1 ? '' : 's'}
                  {due > 0 && <span className="ml-1 font-semibold text-[var(--accent)]">· {due} due</span>}
                </p>
                <div className="mt-4 flex gap-2">
                  <button className="btn btn-primary flex-1 px-2 text-xs" onClick={() => setStudying(d)} disabled={d.cards.length === 0}>
                    <Play size={14} /> Study
                  </button>
                  <button className="btn flex-1 px-2 text-xs" onClick={() => setGenerating(d)}>
                    <Sparkles size={14} /> Generate
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {generating && <GenerateModal deck={generating} onClose={() => setGenerating(null)} onDone={load} />}
    </div>
  )
}

function GenerateModal({ deck, onClose, onDone }: { deck: Deck; onClose: () => void; onDone: () => Promise<void> }) {
  const [source, setSource] = useState('')
  const [count, setCount] = useState(12)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const go = async () => {
    if (!source.trim()) return
    setBusy(true)
    setErr('')
    try {
      await call(window.api.decks.generate(deck.id, source, count))
      await onDone()
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-[560px] max-w-[90vw] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Generate cards · {deck.emoji} {deck.title}</h3>
          <button className="btn btn-ghost px-2" onClick={onClose}><X size={16} /></button>
        </div>
        <textarea
          className="input h-40 resize-none"
          placeholder="A topic (e.g. 'The French Revolution') or paste your notes to turn into flashcards…"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm" style={{ color: 'var(--text-dim)' }}>Cards</label>
          <input type="range" min={5} max={30} value={count} onChange={(e) => setCount(+e.target.value)} className="flex-1 accent-[var(--accent)]" />
          <span className="w-8 text-center font-semibold">{count}</span>
        </div>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={busy || !source.trim()}>
            {busy ? <Spinner size={15} /> : <Sparkles size={15} />} Generate
          </button>
        </div>
      </div>
    </div>
  )
}

const GRADES: { label: string; grade: ReviewGrade; color: string }[] = [
  { label: 'Again', grade: 1, color: '#ef4444' },
  { label: 'Hard', grade: 3, color: '#f59e0b' },
  { label: 'Good', grade: 4, color: '#3366ff' },
  { label: 'Easy', grade: 5, color: '#16a34a' }
]

function StudySession({ deck, onExit }: { deck: Deck; onExit: () => Promise<void> }) {
  const [queue, setQueue] = useState<Flashcard[]>(() =>
    deck.cards.filter((c) => c.due <= Date.now() || c.repetitions === 0)
  )
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)

  const card = queue[idx]

  const grade = async (g: ReviewGrade) => {
    if (!card) return
    await call(window.api.decks.review(deck.id, card.id, g))
    setDone((d) => d + 1)
    if (idx + 1 >= queue.length) {
      setIdx(queue.length) // finished
    } else {
      setIdx(idx + 1)
      setFlipped(false)
    }
  }

  if (!queue.length)
    return (
      <div className="grid h-full place-items-center p-8">
        <Empty icon={<Check size={40} />} title="Nothing due right now" hint="All caught up on this deck — come back later." action={<button className="btn btn-primary" onClick={onExit}>Back to decks</button>} />
      </div>
    )

  const finished = idx >= queue.length
  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-6 flex items-center justify-between">
        <button className="btn btn-ghost" onClick={onExit}><X size={16} /> Exit</button>
        <div className="text-sm font-medium" style={{ color: 'var(--text-dim)' }}>
          {finished ? queue.length : idx + 1} / {queue.length}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(done / queue.length) * 100}%`, background: 'var(--accent)' }} />
      </div>

      {finished ? (
        <div className="grid flex-1 place-items-center">
          <div className="text-center">
            <div className="mb-3 text-5xl">🎉</div>
            <h2 className="text-2xl font-bold">Session complete!</h2>
            <p className="mt-1" style={{ color: 'var(--text-dim)' }}>You reviewed {queue.length} cards. Great work.</p>
            <button className="btn btn-primary mt-5" onClick={onExit}>Back to decks</button>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center">
          <div className="w-full max-w-xl">
            <button
              onClick={() => setFlipped((f) => !f)}
              className="card flex min-h-[280px] w-full flex-col items-center justify-center p-8 text-center transition hover:border-[var(--accent)]"
            >
              <span className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                {flipped ? 'Answer' : 'Question'}
              </span>
              <p className="text-xl font-medium leading-relaxed">{flipped ? card.back : card.front}</p>
              {!flipped && card.hint && (
                <p className="mt-4 text-sm italic" style={{ color: 'var(--text-dim)' }}>Hint: {card.hint}</p>
              )}
              <span className="mt-6 flex items-center gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <RotateCcw size={12} /> Click to flip
              </span>
            </button>

            {flipped ? (
              <div className="mt-5 grid grid-cols-4 gap-2">
                {GRADES.map((g) => (
                  <button
                    key={g.grade}
                    onClick={() => grade(g.grade)}
                    className="btn font-semibold text-white"
                    style={{ background: g.color, borderColor: 'transparent' }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn btn-primary mt-5 w-full" onClick={() => setFlipped(true)}>Show answer</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

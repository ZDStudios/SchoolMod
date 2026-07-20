import { useEffect, useState } from 'react'
import { X, CalendarDays, FileText, Search, ArrowLeft } from 'lucide-react'
import { Spinner, ErrorBanner } from './ui'
import { call } from '../lib/utils'
import { useApp } from '../store/app'

export interface ImportedSource {
  name: string
  text: string
}

/**
 * Two-step picker: choose SEQTA course content or a OneNote notebook, then
 * pick the specific item, and hand its text back to the caller (a Notebook
 * source, or a Flashcards generation prompt).
 */
export default function ImportSourceModal({
  onImport,
  onClose
}: {
  onImport: (source: ImportedSource) => void
  onClose: () => void
}) {
  const seqtaOn = useApp((s) => !!s.settings?.seqta.connected)
  const msOn = useApp((s) => !!s.settings?.microsoft.account)
  const [mode, setMode] = useState<'pick' | 'seqta' | 'onenote'>('pick')

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-[520px] max-w-[90vw] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode !== 'pick' && (
              <button className="btn btn-ghost px-2 py-1" onClick={() => setMode('pick')}>
                <ArrowLeft size={15} />
              </button>
            )}
            <h3 className="font-semibold">Import from…</h3>
          </div>
          <button className="btn btn-ghost px-2" onClick={onClose}><X size={16} /></button>
        </div>

        {mode === 'pick' && (
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={!seqtaOn}
              onClick={() => setMode('seqta')}
              className="card flex flex-col items-center gap-2 p-5 text-center transition hover:border-[var(--accent)] disabled:opacity-40"
            >
              <CalendarDays size={26} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium">SEQTA course</span>
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {seqtaOn ? 'Lesson content & files' : 'Connect SEQTA first'}
              </span>
            </button>
            <button
              disabled={!msOn}
              onClick={() => setMode('onenote')}
              className="card flex flex-col items-center gap-2 p-5 text-center transition hover:border-[var(--accent)] disabled:opacity-40"
            >
              <FileText size={26} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium">OneNote</span>
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {msOn ? 'A notebook\'s pages' : 'Connect Microsoft first'}
              </span>
            </button>
          </div>
        )}

        {mode === 'seqta' && <SeqtaPicker onImport={(s) => { onImport(s); onClose() }} />}
        {mode === 'onenote' && <OneNotePicker onImport={(s) => { onImport(s); onClose() }} />}
      </div>
    </div>
  )
}

function SeqtaPicker({ onImport }: { onImport: (s: ImportedSource) => void }) {
  const [subjects, setSubjects] = useState<{ code: string; title: string }[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    call(window.api.seqta.subjectsList())
      .then(setSubjects)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const pick = async (title: string) => {
    setImporting(title)
    setErr('')
    try {
      const results = await call(window.api.seqta.courseContent(title))
      const c = results[0]
      if (!c) throw new Error('No course content found.')
      const text = [c.files.length ? `Files: ${c.files.join(', ')}` : '', c.text].filter(Boolean).join('\n\n')
      onImport({ name: `${c.subject} — SEQTA course content`, text })
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setImporting('')
    }
  }

  const filtered = subjects.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <ErrorBanner message={err} />
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
        <input className="input pl-8" placeholder="Search your subjects…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <div className="py-8"><Spinner size={20} /></div>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.code}
              onClick={() => pick(s.title)}
              disabled={!!importing}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              <span>{s.title}</span>
              {importing === s.title ? <Spinner size={14} /> : <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{s.code}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-xs" style={{ color: 'var(--text-dim)' }}>No matching subjects.</p>}
        </div>
      )}
    </div>
  )
}

function OneNotePicker({ onImport }: { onImport: (s: ImportedSource) => void }) {
  const [notebooks, setNotebooks] = useState<{ name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    call(window.api.microsoft.oneNote())
      .then(setNotebooks)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const pick = async (name: string) => {
    setImporting(name)
    setErr('')
    try {
      const r = await call(window.api.microsoft.readNotebook(name))
      const parts = [
        r.pages.length ? `Pages: ${r.pages.join(', ')}` : '',
        r.sections.length ? `Sections: ${r.sections.join(', ')}` : '',
        r.text
      ].filter(Boolean)
      onImport({ name: `${r.notebook} — OneNote`, text: parts.join('\n\n') })
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setImporting('')
    }
  }

  return (
    <div>
      <ErrorBanner message={err} />
      {loading ? (
        <div className="py-8"><Spinner size={20} /></div>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {notebooks.map((n) => (
            <button
              key={n.name}
              onClick={() => pick(n.name)}
              disabled={!!importing}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              <span className="truncate">{n.name}</span>
              {importing === n.name && <Spinner size={14} />}
            </button>
          ))}
          {notebooks.length === 0 && <p className="py-6 text-center text-xs" style={{ color: 'var(--text-dim)' }}>No notebooks found.</p>}
        </div>
      )}
    </div>
  )
}

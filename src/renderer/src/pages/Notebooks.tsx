import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Plus,
  FileText,
  Upload,
  Trash2,
  ArrowLeft,
  Send,
  Sparkles,
  ScrollText,
  X,
  Quote,
  Layers,
  Download
} from 'lucide-react'
import { PageHeader, Empty, Spinner, PromptModal } from '../components/ui'
import ImportSourceModal from '../components/ImportSourceModal'
import { Markdown } from '../lib/md'
import { call, timeAgo } from '../lib/utils'
import type { Notebook, ChatMessage, Citation } from '../../../shared/types'

export default function Notebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setNotebooks(await call(window.api.notebooks.list()))
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const active = notebooks.find((n) => n.id === activeId) || null

  const create = async (title: string) => {
    const nb = await call(window.api.notebooks.create(title))
    await load()
    setActiveId(nb.id)
  }

  if (loading) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  if (active)
    return <NotebookDetail notebook={active} onBack={() => setActiveId(null)} onChange={load} />

  return (
    <div className="p-8">
      <PageHeader
        title="Notebooks"
        subtitle="Your private NotebookLM — chat with your notes and documents"
        icon={<BookOpen size={20} />}
        actions={
          <button className="btn btn-primary" onClick={() => setNaming(true)}>
            <Plus size={16} /> New notebook
          </button>
        }
      />
      {notebooks.length === 0 ? (
        <Empty
          icon={<BookOpen size={40} />}
          title="Create your first notebook"
          hint="Add your class notes, textbook PDFs or handouts, then ask questions and get answers grounded in your own sources."
          action={
            <button className="btn btn-primary" onClick={() => setNaming(true)}>
              <Plus size={16} /> New notebook
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {notebooks.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
            >
              <div className="text-3xl">{n.emoji}</div>
              <p className="mt-3 truncate font-semibold">{n.title}</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                {n.sources.length} source{n.sources.length === 1 ? '' : 's'} · {timeAgo(n.updatedAt)}
              </p>
            </button>
          ))}
        </div>
      )}
      {naming && (
        <PromptModal
          title="New notebook"
          label="Notebook name"
          defaultValue="Untitled notebook"
          onSubmit={create}
          onClose={() => setNaming(false)}
        />
      )}
    </div>
  )
}

function NotebookDetail({ notebook, onBack, onChange }: { notebook: Notebook; onBack: () => void; onChange: () => Promise<void> }) {
  const [nb, setNb] = useState(notebook)
  const [messages, setMessages] = useState<ChatMessage[]>(notebook.chat || [])
  const [citations, setCitations] = useState<Record<number, Citation[]>>({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [panel, setPanel] = useState<'summary' | 'guide' | null>(null)
  const [panelText, setPanelText] = useState('')
  const [panelBusy, setPanelBusy] = useState(false)
  const [makingDeck, setMakingDeck] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const refresh = async (updated?: Notebook) => {
    if (updated) setNb(updated)
    await onChange()
  }

  const addFiles = async () => {
    setBusy(true)
    try {
      const updated = await call(window.api.notebooks.addSourceFiles(nb.id))
      await refresh(updated)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (source: { name: string; text: string }) => {
    const updated = await call(window.api.notebooks.addSourceText(nb.id, source.name, source.text))
    await refresh(updated)
  }

  const removeSource = async (sourceId: string) => {
    const updated = await call(window.api.notebooks.removeSource(nb.id, sourceId))
    await refresh(updated)
  }

  const ask = async () => {
    const q = input.trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q } as ChatMessage]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await call(window.api.notebooks.ask(nb.id, q))
      const withAnswer = [...next, { role: 'assistant', content: res.answer } as ChatMessage]
      setMessages(withAnswer)
      setCitations((c) => ({ ...c, [withAnswer.length - 1]: res.citations }))
      await call(window.api.notebooks.saveChat(nb.id, withAnswer))
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${e.message}` }])
    } finally {
      setBusy(false)
    }
  }

  const runPanel = async (kind: 'summary' | 'guide') => {
    setPanel(kind)
    setPanelBusy(true)
    setPanelText('')
    try {
      if (kind === 'summary') {
        const updated = await call(window.api.notebooks.summarise(nb.id))
        setPanelText(updated.summary)
        await refresh(updated)
      } else {
        setPanelText(await call(window.api.notebooks.studyGuide(nb.id)))
      }
    } catch (e: any) {
      setPanelText(`⚠️ ${e.message}`)
    } finally {
      setPanelBusy(false)
    }
  }

  const makeDeck = async () => {
    setMakingDeck(true)
    try {
      const corpus = nb.chunks.slice(0, 24).map((c) => c.text).join('\n\n') || nb.summary
      const deck = await call(window.api.decks.create(nb.title))
      await call(window.api.decks.generate(deck.id, corpus, 15))
      alert(`Created a flashcard deck "${nb.title}". Open Flashcards to study it.`)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setMakingDeck(false)
    }
  }

  const hasSources = nb.sources.length > 0

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center gap-3">
        <button className="btn btn-ghost px-2" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <span className="text-2xl">{nb.emoji}</span>
        <h1 className="text-xl font-bold">{nb.title}</h1>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => runPanel('summary')} disabled={!hasSources}>
            <Sparkles size={15} /> Summarise
          </button>
          <button className="btn" onClick={() => runPanel('guide')} disabled={!hasSources}>
            <ScrollText size={15} /> Study guide
          </button>
          <button className="btn" onClick={makeDeck} disabled={!hasSources || makingDeck}>
            {makingDeck ? <Spinner size={15} /> : <Layers size={15} />} To flashcards
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-4">
        {/* Sources */}
        <div className="card flex min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Sources</span>
            <span className="chip">{nb.sources.length}</span>
          </div>
          <div className="mb-3 flex gap-2">
            <button className="btn flex-1 px-2 text-xs" onClick={addFiles} disabled={busy}>
              <Upload size={14} /> Files
            </button>
            <button className="btn flex-1 px-2 text-xs" onClick={() => setPasting(true)}>
              <FileText size={14} /> Paste
            </button>
          </div>
          <button className="btn mb-3 w-full px-2 text-xs" onClick={() => setImporting(true)}>
            <Download size={14} /> Import from SEQTA / OneNote
          </button>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {nb.sources.length === 0 && (
              <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-dim)' }}>
                Add PDFs, Word docs or notes to ground your answers.
              </p>
            )}
            {nb.sources.map((s) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-lg p-2" style={{ background: 'var(--bg)' }}>
                <FileText size={15} style={{ color: 'var(--accent)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{s.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    {(s.charCount / 1000).toFixed(1)}k chars
                  </p>
                </div>
                <button onClick={() => removeSource(s.id)} className="opacity-0 transition group-hover:opacity-100">
                  <Trash2 size={13} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="card flex min-h-0 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <BookOpen size={34} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
                  <p className="font-semibold">Ask your notebook anything</p>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                    {hasSources ? 'Answers are grounded in your sources, with citations.' : 'Add a source to get started.'}
                  </p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: m.role === 'user' ? 'var(--text-dim)' : 'var(--accent)' }}>
                    {m.role === 'user' ? 'You' : <BookOpen size={13} />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'text-white' : ''}`} style={{ background: m.role === 'user' ? 'var(--accent)' : 'var(--bg)', border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>
                    {m.role === 'user' ? <span className="whitespace-pre-wrap">{m.content}</span> : <Markdown text={m.content} />}
                  </div>
                </div>
                {citations[i]?.length > 0 && (
                  <div className="ml-10 mt-2 flex flex-wrap gap-1.5">
                    {citations[i].map((c) => (
                      <span key={c.chunkIndex} className="chip cursor-default" title={c.snippet}>
                        <Quote size={11} /> [{c.chunkIndex}] {c.sourceName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="ml-10"><Spinner size={16} /></div>}
          </div>
          <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-end gap-2">
              <textarea
                className="input max-h-32 min-h-[44px] flex-1 resize-none"
                rows={1}
                placeholder={hasSources ? 'Ask about your sources…' : 'Add a source first…'}
                value={input}
                disabled={!hasSources}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask()
                  }
                }}
              />
              <button className="btn btn-primary h-[44px]" onClick={ask} disabled={busy || !input.trim()}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {pasting && <PasteModal nbId={nb.id} onClose={() => setPasting(false)} onDone={refresh} />}
      {importing && <ImportSourceModal onImport={handleImport} onClose={() => setImporting(false)} />}
      {panel && (
        <SidePanel title={panel === 'summary' ? 'Summary' : 'Study guide'} busy={panelBusy} text={panelText} onClose={() => setPanel(null)} />
      )}
    </div>
  )
}

function PasteModal({ nbId, onClose, onDone }: { nbId: string; onClose: () => void; onDone: (nb: Notebook) => void }) {
  const [name, setName] = useState('Pasted notes')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!text.trim()) return
    setBusy(true)
    const updated = await call(window.api.notebooks.addSourceText(nbId, name, text))
    onDone(updated)
    onClose()
  }
  return (
    <Overlay onClose={onClose}>
      <div className="card w-[560px] max-w-[90vw] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Paste text as a source</h3>
          <button className="btn btn-ghost px-2" onClick={onClose}><X size={16} /></button>
        </div>
        <input className="input mb-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Source name" />
        <textarea className="input h-56 resize-none" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your notes, an article, definitions…" />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? <Spinner size={15} /> : <Plus size={15} />} Add source
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function SidePanel({ title, text, busy, onClose }: { title: string; text: string; busy: boolean; onClose: () => void }) {
  return (
    <Overlay onClose={onClose} align="right">
      <div className="card ml-auto h-full w-[540px] max-w-[92vw] overflow-y-auto rounded-none border-y-0 border-r-0 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <div className="flex gap-1">
            {!busy && text && (
              <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => window.api.saveFile(`${title.toLowerCase().replace(/\s+/g, '-')}.md`, text)}>
                <Download size={14} /> Export
              </button>
            )}
            <button className="btn btn-ghost px-2" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        {busy ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-dim)' }}>
            <Spinner size={16} /> Generating with Claude…
          </div>
        ) : (
          <Markdown text={text} />
        )}
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose, align = 'center' }: { children: React.ReactNode; onClose: () => void; align?: 'center' | 'right' }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex ${align === 'right' ? 'justify-end' : 'items-center justify-center'} bg-black/40 backdrop-blur-sm`}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className={align === 'right' ? 'h-full' : ''}>
        {children}
      </div>
    </div>
  )
}

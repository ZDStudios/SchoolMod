import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Trash2, Square } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { Markdown } from '../lib/md'
import { call } from '../lib/utils'
import type { ChatMessage } from '../../../shared/types'

const SYSTEM: ChatMessage = {
  role: 'system',
  content:
    'You are SchoolMod Assistant, a friendly, sharp study companion for a high-school / senior student. ' +
    'Explain clearly, show working for maths and science, and keep answers well-structured with markdown. ' +
    'Encourage understanding over shortcuts.'
}

const SUGGESTIONS = [
  'Explain photosynthesis like I\'m 15',
  'Help me plan an essay on climate change',
  'Quiz me on quadratic equations',
  'Summarise the causes of WWI'
]

const KEY = 'schoolmod.assistant.chat'

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]')
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(messages))
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    const next = [...messages, { role: 'user', content } as ChatMessage]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)

    const off = window.api.claude.onStreamChunk((delta) => {
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        copy[copy.length - 1] = { ...last, content: last.content + delta }
        return copy
      })
    })
    try {
      await call(window.api.claude.chatStream([SYSTEM, ...next]))
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: `⚠️ ${e.message}\n\nCheck your Claude connection in **Settings**.` }
        return copy
      })
    } finally {
      off()
      setStreaming(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-8 pb-0">
      <PageHeader
        title="AI Assistant"
        subtitle="Powered by your Claude subscription"
        icon={<Sparkles size={20} />}
        actions={
          messages.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setMessages([])}>
              <Trash2 size={15} /> Clear
            </button>
          )
        }
      />

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6">
        {messages.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl text-white" style={{ background: 'var(--accent)' }}>
              <Sparkles size={30} />
            </div>
            <h2 className="text-xl font-bold">How can I help you study today?</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
              Ask anything — explanations, essay help, practice questions and more.
            </p>
            <div className="mt-6 grid max-w-lg grid-cols-2 gap-2.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="card p-3 text-left text-sm hover:border-[var(--accent)]" style={{ transition: 'border-color .15s' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} msg={m} streaming={streaming && i === messages.length - 1} />)
        )}
      </div>

      <div className="sticky bottom-0 -mx-8 border-t px-8 py-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="flex items-end gap-2">
          <textarea
            className="input max-h-40 min-h-[46px] flex-1 resize-none"
            rows={1}
            placeholder="Message SchoolMod Assistant…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button className="btn btn-primary h-[46px] px-4" onClick={() => send()} disabled={streaming || !input.trim()}>
            {streaming ? <Square size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function Bubble({ msg, streaming }: { msg: ChatMessage; streaming: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
        style={{ background: isUser ? 'var(--text-dim)' : 'var(--accent)' }}
      >
        {isUser ? 'You' : <Sparkles size={15} />}
      </div>
      <div
        className={`max-w-[76%] rounded-2xl px-4 py-2.5 text-sm ${isUser ? 'text-white' : ''}`}
        style={{ background: isUser ? 'var(--accent)' : 'var(--bg-elev)', border: isUser ? 'none' : '1px solid var(--border)' }}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : (
          <>
            <Markdown text={msg.content || '…'} />
            {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />}
          </>
        )}
      </div>
    </div>
  )
}

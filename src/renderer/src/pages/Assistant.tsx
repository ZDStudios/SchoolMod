import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Trash2, Square, Plus, MessageSquare, Pencil, Check, X } from 'lucide-react'
import { Markdown } from '../lib/md'
import { call } from '../lib/utils'
import { useApp } from '../store/app'
import type { ChatMessage } from '../../../shared/types'

const SUGGESTIONS = [
  "What's on my timetable today?",
  'What assessments do I have coming up?',
  'How are my grades looking?',
  'Switch the app to dark mode'
]

/** Friendly labels for the tools the agent can call. */
const TOOL_LABEL: Record<string, string> = {
  seqta_me: 'Checking your profile',
  seqta_timetable: 'Reading your timetable',
  seqta_timetable_week: 'Reading your week',
  seqta_assessments: 'Looking up assessments',
  seqta_grades: 'Fetching your grades',
  seqta_notices: 'Reading notices',
  seqta_homework: 'Checking homework',
  seqta_messages: 'Checking your inbox',
  bell_times: 'Checking bell times',
  app_set_theme: 'Changing the theme',
  app_set_accent: 'Changing the accent colour',
  app_list_notebooks: 'Listing notebooks',
  app_create_notebook: 'Creating a notebook',
  app_list_decks: 'Listing decks',
  app_create_flashcards: 'Building flashcards',
  app_get_settings: 'Checking settings',
  ms_onenote_notebooks: 'Listing OneNote notebooks',
  ms_onenote_read: 'Reading your OneNote notebook',
  ms_recent_files: 'Checking recent Office files'
}

interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

const STORE_KEY = 'schoolmod.assistant.chats'
const uid = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

function loadChats(): { chats: Chat[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.chats?.length) return parsed
    }
  } catch {
    /* fall through to legacy migration */
  }
  // Migrate the old single-conversation format if present.
  try {
    const legacy = JSON.parse(localStorage.getItem('schoolmod.assistant.chat') || '[]')
    if (Array.isArray(legacy) && legacy.length) {
      const chat: Chat = { id: uid(), title: titleFrom(legacy), messages: legacy, createdAt: Date.now(), updatedAt: Date.now() }
      return { chats: [chat], activeId: chat.id }
    }
  } catch {
    /* ignore */
  }
  const chat = newChat()
  return { chats: [chat], activeId: chat.id }
}

function newChat(): Chat {
  return { id: uid(), title: 'New chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}

function titleFrom(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim() || 'New chat'
  return first.length > 42 ? first.slice(0, 42) + '…' : first
}

export default function Assistant() {
  const [{ chats, activeId }, setState] = useState(loadChats)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [tool, setTool] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const active = chats.find((c) => c.id === activeId) || chats[0]
  const messages = active?.messages || []

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ chats, activeId }))
  }, [chats, activeId])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!stickToBottom.current) return
    const el = scroller.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, tool, streaming, activeId])

  const updateActive = (fn: (c: Chat) => Chat) =>
    setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === s.activeId ? fn(c) : c)) }))

  const createChat = () => {
    const c = newChat()
    setState((s) => ({ chats: [c, ...s.chats], activeId: c.id }))
  }

  const deleteChat = (id: string) => {
    setState((s) => {
      const remaining = s.chats.filter((c) => c.id !== id)
      if (remaining.length === 0) {
        const c = newChat()
        return { chats: [c], activeId: c.id }
      }
      return { chats: remaining, activeId: s.activeId === id ? remaining[0].id : s.activeId }
    })
  }

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming || !active) return
    const next = [...active.messages, { role: 'user', content } as ChatMessage]
    stickToBottom.current = true
    const chatId = active.id
    const isFirstMessage = active.messages.length === 0
    updateActive((c) => ({
      ...c,
      messages: [...next, { role: 'assistant', content: '' }],
      title: isFirstMessage ? titleFrom(next) : c.title,
      updatedAt: Date.now()
    }))
    setInput('')
    setStreaming(true)
    setTool('')

    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c
          const copy = [...c.messages]
          copy[copy.length - 1] = fn(copy[copy.length - 1])
          return { ...c, messages: copy }
        })
      }))

    const offChunk = window.api.claude.onStreamChunk((delta) => {
      patchLast((last) => ({ ...last, content: last.content + delta }))
    })
    const offTool = window.api.claude.onAgentTool((t) => setTool(TOOL_LABEL[t] || t))
    const offSettings = window.api.settings.onChanged(() => useApp.getState().load())

    try {
      await call(window.api.claude.agentChat(next))
    } catch (e: any) {
      patchLast(() => ({ role: 'assistant', content: `⚠️ ${e.message}\n\nCheck your AI connection in **Settings**.` }))
    } finally {
      offChunk()
      offTool()
      offSettings()
      setTool('')
      setStreaming(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Chat list sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r p-3" style={{ borderColor: 'var(--border)' }}>
        <button className="btn btn-primary mb-3 w-full" onClick={createChat}>
          <Plus size={15} /> New chat
        </button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {chats
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((c) => (
              <div
                key={c.id}
                onClick={() => setState((s) => ({ ...s, activeId: c.id }))}
                className="group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm cursor-pointer"
                style={{ background: c.id === activeId ? 'var(--accent-soft)' : 'transparent', color: c.id === activeId ? 'var(--accent)' : 'var(--text)' }}
              >
                <MessageSquare size={14} className="shrink-0" />
                {renaming === c.id ? (
                  <input
                    autoFocus
                    className="input min-w-0 flex-1 !py-1 text-xs"
                    value={renameValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setState((s) => ({ ...s, chats: s.chats.map((x) => (x.id === c.id ? { ...x, title: renameValue.trim() || x.title } : x)) }))
                        setRenaming(null)
                      }
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                )}
                {renaming === c.id ? (
                  <button onClick={(e) => { e.stopPropagation(); setState((s) => ({ ...s, chats: s.chats.map((x) => (x.id === c.id ? { ...x, title: renameValue.trim() || x.title } : x)) })); setRenaming(null) }}>
                    <Check size={13} />
                  </button>
                ) : (
                  <>
                    <button
                      className="opacity-0 transition group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setRenaming(c.id); setRenameValue(c.title) }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="opacity-0 text-red-500 transition group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteChat(c.id) }}
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Active conversation */}
      <div className="flex min-h-0 flex-1 flex-col p-8 pb-0">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl text-white" style={{ background: 'var(--accent)' }}>
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{active?.title || 'AI Assistant'}</h1>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Powered by your Claude subscription</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button className="btn btn-ghost" onClick={() => updateActive((c) => ({ ...c, messages: [], title: 'New chat' }))}>
              <Trash2 size={15} /> Clear
            </button>
          )}
        </div>

        <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6">
          {messages.length === 0 ? (
            <div className="mt-10 flex flex-col items-center text-center">
              <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl text-white" style={{ background: 'var(--accent)' }}>
                <Sparkles size={30} />
              </div>
              <h2 className="text-xl font-bold">How can I help you study today?</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
                I can read your real SEQTA data — timetable, assessments, grades, notices — and change the app for you.
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
          {tool && (
            <div className="ml-11 flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
              {tool}…
            </div>
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

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Trash2, Square, Plus, MessageSquare, Pencil, Check, X } from 'lucide-react'
import { Markdown } from '../lib/md'
import { useChat } from '../store/chat'
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
  seqta_subjects: 'Listing your subjects',
  seqta_course_content: 'Reading course content',
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
  ms_recent_files: 'Checking recent Office files',
  computer_list_dir: 'Looking at your files',
  computer_read_file: 'Reading a file on your computer',
  computer_search_files: 'Searching your files',
  computer_open_path: 'Opening a file'
}

export default function Assistant() {
  const { chats, activeId, streaming, streamingChatId, tool, createChat, deleteChat, renameChat, switchChat, clearActive, send } = useChat()
  const [input, setInput] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const active = chats.find((c) => c.id === activeId) || chats[0]
  const messages = active?.messages || []
  const activeIsStreaming = streaming && streamingChatId === activeId
  const otherChatStreaming = streaming && streamingChatId !== activeId

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
    // The chat keeps streaming even while this page isn't mounted (it lives
    // in a zustand store, not component state) — jump to the bottom whenever
    // we land back on it mid-answer, then keep following new content.
    stickToBottom.current = true
  }, [activeId])

  useEffect(() => {
    if (!stickToBottom.current) return
    const el = scroller.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, tool, streaming, activeId])

  const submit = (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    stickToBottom.current = true
    setInput('')
    send(content)
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
                onClick={() => switchChat(c.id)}
                className="group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm cursor-pointer"
                style={{ background: c.id === activeId ? 'var(--accent-soft)' : 'transparent', color: c.id === activeId ? 'var(--accent)' : 'var(--text)' }}
              >
                {c.id === streamingChatId ? (
                  <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
                ) : (
                  <MessageSquare size={14} className="shrink-0" />
                )}
                {renaming === c.id ? (
                  <input
                    autoFocus
                    className="input min-w-0 flex-1 !py-1 text-xs"
                    value={renameValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameChat(c.id, renameValue)
                        setRenaming(null)
                      }
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                )}
                {renaming === c.id ? (
                  <button onClick={(e) => { e.stopPropagation(); renameChat(c.id, renameValue); setRenaming(null) }}>
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
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                {otherChatStreaming ? 'Still answering in another chat…' : 'Powered by your Claude subscription'}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button className="btn btn-ghost" onClick={clearActive}>
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
                I keep working even if you switch tabs.
              </p>
              <div className="mt-6 grid max-w-lg grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => submit(s)} className="card p-3 text-left text-sm hover:border-[var(--accent)]" style={{ transition: 'border-color .15s' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={i} msg={m} streaming={activeIsStreaming && i === messages.length - 1} />)
          )}
          {tool && activeIsStreaming && (
            <div className="ml-11 flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
              {TOOL_LABEL[tool] || tool}…
            </div>
          )}
        </div>

        <div className="sticky bottom-0 -mx-8 border-t px-8 py-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="flex items-end gap-2">
            <textarea
              className="input max-h-40 min-h-[46px] flex-1 resize-none"
              rows={1}
              placeholder={streaming ? 'Waiting for the current reply to finish…' : 'Message SchoolMod Assistant…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <button className="btn btn-primary h-[46px] px-4" onClick={() => submit()} disabled={streaming || !input.trim()}>
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

import { create } from 'zustand'
import { call } from '../lib/utils'
import { useApp } from './app'
import type { ChatMessage } from '../../../shared/types'

export interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

const STORE_KEY = 'schoolmod.assistant.chats'
const uid = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

function newChat(): Chat {
  return { id: uid(), title: 'New chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}

function titleFrom(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim() || 'New chat'
  return first.length > 42 ? first.slice(0, 42) + '…' : first
}

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

interface ChatState {
  chats: Chat[]
  activeId: string
  streaming: boolean
  /** Which chat is actually generating a reply — may differ from activeId if the user switched tabs mid-answer. */
  streamingChatId: string | null
  tool: string
  createChat: () => void
  deleteChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  switchChat: (id: string) => void
  clearActive: () => void
  send: (text: string) => Promise<void>
}

/**
 * Lives outside the Assistant page component, so streaming/tool-call updates
 * keep landing here — and get persisted — even while the user is on a
 * different tab. The IPC subscriptions below are registered for the duration
 * of `send()`'s own promise chain, not tied to any component's mount state,
 * so navigating away mid-answer no longer drops the rest of the response.
 */
export const useChat = create<ChatState>((set, get) => {
  const persist = () => {
    const { chats, activeId } = get()
    localStorage.setItem(STORE_KEY, JSON.stringify({ chats, activeId }))
  }

  const updateChat = (id: string, fn: (c: Chat) => Chat) => {
    set((s) => ({ chats: s.chats.map((c) => (c.id === id ? fn(c) : c)) }))
    persist()
  }

  const initial = loadChats()

  return {
    chats: initial.chats,
    activeId: initial.activeId,
    streaming: false,
    streamingChatId: null,
    tool: '',

    createChat: () => {
      const c = newChat()
      set((s) => ({ chats: [c, ...s.chats], activeId: c.id }))
      persist()
    },

    deleteChat: (id) => {
      set((s) => {
        const remaining = s.chats.filter((c) => c.id !== id)
        if (remaining.length === 0) {
          const c = newChat()
          return { chats: [c], activeId: c.id }
        }
        return { chats: remaining, activeId: s.activeId === id ? remaining[0].id : s.activeId }
      })
      persist()
    },

    renameChat: (id, title) => {
      updateChat(id, (c) => ({ ...c, title: title.trim() || c.title }))
    },

    switchChat: (id) => {
      set({ activeId: id })
      persist()
    },

    clearActive: () => {
      updateChat(get().activeId, (c) => ({ ...c, messages: [], title: 'New chat' }))
    },

    send: async (text: string) => {
      const content = text.trim()
      const chatId = get().activeId
      const chat = get().chats.find((c) => c.id === chatId)
      if (!content || get().streaming || !chat) return

      const next = [...chat.messages, { role: 'user', content } as ChatMessage]
      const isFirstMessage = chat.messages.length === 0
      updateChat(chatId, (c) => ({
        ...c,
        messages: [...next, { role: 'assistant', content: '' }],
        title: isFirstMessage ? titleFrom(next) : c.title,
        updatedAt: Date.now()
      }))
      set({ streaming: true, streamingChatId: chatId, tool: '' })

      const patchLast = (fn: (m: ChatMessage) => ChatMessage) => {
        updateChat(chatId, (c) => {
          const copy = [...c.messages]
          copy[copy.length - 1] = fn(copy[copy.length - 1])
          return { ...c, messages: copy }
        })
      }

      const offChunk = window.api.claude.onStreamChunk((delta) => {
        patchLast((last) => ({ ...last, content: last.content + delta }))
      })
      const offTool = window.api.claude.onAgentTool((t) => set({ tool: t }))
      const offSettings = window.api.settings.onChanged(() => useApp.getState().load())

      try {
        await call(window.api.claude.agentChat(next))
      } catch (e: any) {
        patchLast(() => ({ role: 'assistant', content: `⚠️ ${e.message}\n\nCheck your AI connection in **Settings**.` }))
      } finally {
        offChunk()
        offTool()
        offSettings()
        set({ streaming: false, streamingChatId: null, tool: '' })
      }
    }
  }
})

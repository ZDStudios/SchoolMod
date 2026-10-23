import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS, Settings, Notebook, Deck, ChatMessage } from '../shared/types'

/**
 * Tiny dependency-free JSON store. One file per namespace under Electron's
 * userData directory. Chosen over electron-store to avoid ESM/CJS friction and
 * keep the packaged app lean.
 */
class JsonFile<T> {
  private path: string
  private cache: T
  constructor(name: string, fallback: T) {
    const dir = join(app.getPath('userData'), 'store')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.path = join(dir, `${name}.json`)
    if (existsSync(this.path)) {
      try {
        // Strip a UTF-8 BOM — editors/PowerShell add one and JSON.parse chokes,
        // which would silently reset every setting to defaults.
        const raw = readFileSync(this.path, 'utf-8').replace(/^﻿/, '')
        this.cache = { ...fallback, ...JSON.parse(raw) }
      } catch {
        this.cache = fallback
      }
    } else {
      this.cache = fallback
      this.flush()
    }
  }
  get(): T {
    return this.cache
  }
  set(value: T): T {
    this.cache = value
    this.flush()
    return this.cache
  }
  update(patch: Partial<T>): T {
    this.cache = { ...this.cache, ...patch }
    this.flush()
    return this.cache
  }
  private flush() {
    writeFileSync(this.path, JSON.stringify(this.cache, null, 2), 'utf-8')
  }
}

let settingsStore: JsonFile<Settings>
let notebooksStore: JsonFile<{ notebooks: Notebook[] }>
let decksStore: JsonFile<{ decks: Deck[] }>
let chatStore: JsonFile<{ messages: ChatMessage[] }>

export function initStores() {
  settingsStore = new JsonFile<Settings>('settings', DEFAULT_SETTINGS)
  notebooksStore = new JsonFile('notebooks', { notebooks: [] })
  decksStore = new JsonFile('decks', { decks: [] })
  chatStore = new JsonFile('chat', { messages: [] })
}

// --- settings ---
/** Deep-merge stored settings over defaults so new nested fields always exist. */
export const getSettings = (): Settings => {
  const s = settingsStore.get()
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    claude: { ...DEFAULT_SETTINGS.claude, ...s.claude },
    codex: { ...DEFAULT_SETTINGS.codex, ...(s as any).codex },
    seqta: {
      ...DEFAULT_SETTINGS.seqta,
      ...s.seqta,
      mcp: { ...DEFAULT_SETTINGS.seqta.mcp, ...(s.seqta as any)?.mcp }
    },
    microsoft: { ...DEFAULT_SETTINGS.microsoft, ...s.microsoft },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(s as any).notifications },
    desktop: { ...DEFAULT_SETTINGS.desktop, ...(s as any).desktop }
  }
}
export const setSettings = (patch: Partial<Settings>): Settings => {
  settingsStore.update(patch)
  return getSettings()
}

// --- notebooks ---
export const getNotebooks = (): Notebook[] => notebooksStore.get().notebooks
export const saveNotebooks = (notebooks: Notebook[]) => notebooksStore.set({ notebooks })

// --- decks ---
export const getDecks = (): Deck[] => decksStore.get().decks
export const saveDecks = (decks: Deck[]) => decksStore.set({ decks })

// --- chat ---
export const getChat = (): ChatMessage[] => chatStore.get().messages
export const saveChat = (messages: ChatMessage[]) => chatStore.set({ messages })

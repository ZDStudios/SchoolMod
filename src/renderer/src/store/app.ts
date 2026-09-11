import { create } from 'zustand'
import type { Settings, ThemeMode } from '../../../shared/types'
import { call } from '../lib/utils'

interface AppState {
  settings: Settings | null
  loaded: boolean
  load: () => Promise<void>
  save: (patch: Partial<Settings>) => Promise<void>
  applyTheme: () => void
  refreshIdentity: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  settings: null,
  loaded: false,
  load: async () => {
    const settings = await call(window.api.settings.get())
    set({ settings, loaded: true })
    get().applyTheme()
  },
  save: async (patch) => {
    const settings = await call(window.api.settings.set(patch))
    set({ settings })
    get().applyTheme()
  },
  refreshIdentity: async () => {
    const s = get().settings
    if (!s?.seqta.connected || s.seqta.mode !== 'sso') return
    try {
      const r = await call(window.api.seqta.me())
      if (r.name && r.name !== s.seqta.displayName) {
        await get().save({ seqta: { ...get().settings!.seqta, displayName: r.name } })
      }
    } catch {
      /* offline / session issue — keep existing name */
    }
  },
  applyTheme: () => {
    const s = get().settings
    if (!s) return
    const mode: ThemeMode = s.theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = mode === 'dark' || (mode === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', dark)
    if (s.accent) document.documentElement.style.setProperty('--accent', s.accent)
  }
}))

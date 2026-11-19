import { create } from 'zustand'
import type { UpdateInfo } from '../../../shared/types'
import { call } from '../lib/utils'
import { useApp } from './app'

interface UpdateState {
  info: UpdateInfo | null
  checking: boolean
  /** The "new version available" prompt is showing. */
  promptOpen: boolean
  installing: boolean
  progress: number
  error: string
  lastChecked: number
  /** auto = the launch/background check: stays silent unless there's an update the student hasn't skipped. */
  check: (auto?: boolean) => Promise<UpdateInfo | null>
  install: () => Promise<void>
  later: () => void
  skip: () => Promise<void>
  openPrompt: () => void
}

export const useUpdate = create<UpdateState>((set, get) => ({
  info: null,
  checking: false,
  promptOpen: false,
  installing: false,
  progress: 0,
  error: '',
  lastChecked: 0,

  check: async (auto = false) => {
    if (get().checking || get().installing) return get().info
    set({ checking: true, error: auto ? get().error : '' })
    try {
      const info = await call(window.api.update.check())
      const skipped = useApp.getState().settings?.updates?.skippedVersion
      set({ info, checking: false, lastChecked: Date.now() })
      if (info.available && (!auto || info.latest !== skipped)) set({ promptOpen: true })
      return info
    } catch (e: any) {
      // A failed background check shouldn't nag; only manual checks report errors.
      set({ checking: false, error: auto ? '' : e.message })
      return null
    }
  },

  install: async () => {
    set({ installing: true, progress: 0, error: '' })
    const off = window.api.update.onProgress((progress) => set({ progress }))
    try {
      const r = await call(window.api.update.install())
      // 'restarting': the app is about to quit and reopen as the new version.
      if (r.action === 'opened') set({ installing: false, promptOpen: false })
    } catch (e: any) {
      set({ installing: false, error: e.message })
    } finally {
      off()
    }
  },

  later: () => set({ promptOpen: false, error: '' }),

  skip: async () => {
    const info = get().info
    set({ promptOpen: false, error: '' })
    const s = useApp.getState().settings
    if (info && s) await useApp.getState().save({ updates: { ...s.updates, skippedVersion: info.latest } })
  },

  openPrompt: () => set({ promptOpen: true, error: '' })
}))

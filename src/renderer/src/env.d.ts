/// <reference types="vite/client" />
import type { Api } from '../../preload'

declare global {
  /** package.json version, injected at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string

  interface Window {
    api: Api
  }
}

export {}

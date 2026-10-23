import {
  app,
  Tray,
  Menu,
  BrowserWindow,
  globalShortcut,
  clipboard,
  nativeImage,
  shell
} from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getSettings } from '../store'
import { CH } from '../../shared/channels'

/**
 * Desktop-citizen behaviours: system tray, start-on-login, and a global
 * "explain what I just copied" hotkey.
 *
 * All three are opt-in-shaped: tray defaults on (closing the window keeps
 * reminders alive), auto-launch defaults off (nobody likes an app that adds
 * itself to startup uninvited).
 */

let tray: Tray | null = null
/** Set on app.quit() so the close handler stops hiding the window instead of exiting. */
let quitting = false

export const isQuitting = () => quitting
export const markQuitting = () => {
  quitting = true
}

/**
 * Where the tray icon might live, most-specific first.
 *
 * Packaged builds ship `resources/` via extraResources, so it lands next to the
 * asar under process.resourcesPath. In dev, `__dirname` is `out/main`, so the
 * repo root is two levels up — app.getAppPath() is NOT the repo root there, it
 * follows the entry script, which is why it can't be relied on alone.
 */
export function iconCandidates(): string[] {
  return [
    join(process.resourcesPath || '', 'resources', 'icon.png'),
    join(process.resourcesPath || '', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(app.getAppPath(), '..', 'resources', 'icon.png'),
    join(__dirname, '../../resources/icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(app.getAppPath(), 'build', 'icon.png')
  ].filter(Boolean)
}

function iconPath(): string {
  return iconCandidates().find((p) => existsSync(p)) || ''
}

export function setupTray(getWindow: () => BrowserWindow | null) {
  destroyTray()
  if (!getSettings().desktop.tray) return

  const p = iconPath()
  let image = p ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 })
  // An empty image makes Tray throw on Windows, so bail rather than crash the app.
  if (image.isEmpty()) return

  const showWindow = () => {
    const w = getWindow()
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }

  tray = new Tray(image)
  tray.setToolTip('SchoolMod')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open SchoolMod', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          markQuitting()
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}

export function applyAutoLaunch() {
  // Not meaningful in dev — it would register the electron binary, not the app.
  if (!app.isPackaged) return
  const open = getSettings().desktop.autoLaunch
  app.setLoginItemSettings({ openAtLogin: open, args: ['--hidden'] })
}

export function setupQuickExplain(getWindow: () => BrowserWindow | null) {
  globalShortcut.unregisterAll()
  const s = getSettings()
  // Quick-explain sends the clipboard to a model, so it's an AI feature and
  // must not hold a system-wide hotkey while AI is disabled.
  if (!s.aiEnabled) return false
  const accel = s.desktop.quickExplainShortcut
  if (!accel) return false
  try {
    return globalShortcut.register(accel, () => {
      const text = clipboard.readText().trim()
      if (!text) return
      const w = getWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
      // The renderer routes this to the assistant as a new question.
      w.webContents.send(CH.quickExplain, text.slice(0, 4000))
    })
  } catch {
    // Bad accelerator string, or the combo is already owned by another app.
    return false
  }
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll()
}

/** Re-apply everything after the user changes a desktop setting. */
export function refreshDesktop(getWindow: () => BrowserWindow | null) {
  setupTray(getWindow)
  applyAutoLaunch()
  const shortcutOk = setupQuickExplain(getWindow)
  return { tray: !!tray, shortcutOk }
}

export { shell }

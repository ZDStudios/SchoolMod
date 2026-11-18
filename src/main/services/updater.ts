import { app, shell } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, existsSync, renameSync, statSync, unlinkSync, accessSync, constants, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { UpdateInfo } from '../../shared/types'

/**
 * Self-updater backed by GitHub Releases.
 *
 * electron-updater isn't used because it can't update the portable build, and
 * most students run that one. Instead: read the repo's releases, pick the
 * highest `vX.Y.Z` tag that ships a SchoolMod build (the repo also publishes
 * unrelated releases such as the BetterKahoot+ extension, so "latest" alone
 * can't be trusted), download the matching .exe and hand over to it.
 */

const REPO = 'ZDStudios/SchoolMod'

interface Asset {
  name: string
  size: number
  browser_download_url: string
}
interface Release {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  draft: boolean
  prerelease: boolean
  assets: Asset[]
}

/** Test hook: pretend to be an older version (e.g. SCHOOLMOD_UPDATE_TEST_VERSION=1.0.0). */
const currentVersion = () => process.env.SCHOOLMOD_UPDATE_TEST_VERSION || app.getVersion()

function parseVersion(v: string): number[] | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  return m ? m.slice(1).map(Number) : null
}
function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

type Kind = UpdateInfo['kind']
function installKind(): Kind {
  if (process.platform !== 'win32' || !app.isPackaged) return 'manual'
  return process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installer'
}

function assetFor(release: Release, kind: Kind): Asset | undefined {
  const re = kind === 'portable' ? /^SchoolMod-.*-Portable\.exe$/i : kind === 'installer' ? /^SchoolMod-.*-Setup\.exe$/i : null
  return re ? release.assets.find((a) => re.test(a.name)) : undefined
}

let latestRelease: Release | null = null

export async function check(): Promise<UpdateInfo> {
  const current = currentVersion()
  // SCHOOLMOD_UPDATE_FEED: test hook pointing at a stand-in for the GitHub releases API.
  const feed = process.env.SCHOOLMOD_UPDATE_FEED || `https://api.github.com/repos/${REPO}/releases?per_page=30`
  const res = await fetch(feed, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `SchoolMod/${app.getVersion()}` }
  })
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate-limiting update checks right now. Try again later.')
  if (!res.ok) throw new Error(`Couldn't reach GitHub to check for updates (HTTP ${res.status}).`)
  const releases = (await res.json()) as Release[]

  const kind = installKind()
  let best: { r: Release; v: number[] } | null = null
  for (const r of releases) {
    const v = parseVersion(r.tag_name)
    if (!v || r.draft || r.prerelease) continue
    // Must actually ship a SchoolMod desktop build.
    if (!r.assets.some((a) => /^SchoolMod-.*\.(exe|dmg|zip|AppImage)$/i.test(a.name))) continue
    if (!best || compareVersions(v, best.v) > 0) best = { r, v }
  }
  latestRelease = best?.r ?? null

  const cur = parseVersion(current)
  const available = !!(best && cur && compareVersions(best.v, cur) > 0)
  const asset = best ? assetFor(best.r, kind) : undefined
  return {
    current,
    latest: best ? best.r.tag_name.replace(/^v/i, '') : current,
    available,
    notes: (best?.r.body || '').slice(0, 4000),
    title: best?.r.name || '',
    pageUrl: best?.r.html_url || `https://github.com/${REPO}/releases`,
    publishedAt: best?.r.published_at || '',
    kind: asset || kind === 'manual' ? kind : 'manual',
    downloadSize: asset?.size || 0
  }
}

function writableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

async function download(asset: Asset, target: string, onProgress: (fraction: number) => void): Promise<void> {
  if (existsSync(target) && statSync(target).size === asset.size) return onProgress(1) // already downloaded

  const tmp = `${target}.download`
  const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': `SchoolMod/${app.getVersion()}` } })
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`)

  const out = createWriteStream(tmp)
  let got = 0
  let lastSent = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.byteLength
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      const now = Date.now()
      if (now - lastSent > 150) {
        lastSent = now
        onProgress(asset.size ? got / asset.size : 0)
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
  } catch (e) {
    out.destroy()
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw e
  }

  if (got !== asset.size) {
    unlinkSync(tmp)
    throw new Error('The download was incomplete. Please try again.')
  }
  if (existsSync(target)) unlinkSync(target)
  renameSync(tmp, target)
  onProgress(1)
}

/** Quote a path for a batch file (inside "…", % is the only character cmd still expands). */
const batQuote = (s: string) => `"${s.replace(/%/g, '%%')}"`

/**
 * Waits for this app (and, for the portable build, its launcher) to exit,
 * then starts the new version. The portable launcher always unpacks to the
 * same folder, so the old copy must be fully gone first or the new one
 * couldn't overwrite its files.
 *
 * Uses a throwaway .cmd file rather than PowerShell: a detached (console-less)
 * powershell.exe silently exits without running on locked-down Windows
 * machines (verified on a school laptop), while cmd.exe works there.
 */
function launchAfterExit(exe: string, args: string[]) {
  const pids = [process.pid]
  // The portable launcher (SchoolMod-x.y.z-Portable.exe) is our parent process.
  if (process.env.PORTABLE_EXECUTABLE_FILE) pids.push(process.ppid)

  const lines = ['@echo off']
  pids.forEach((pid, i) => {
    lines.push(
      `:wait${i}`,
      `tasklist /nh /fi "PID eq ${pid}" 2>nul | find " ${pid} " >nul && (ping -n 2 127.0.0.1 >nul & goto wait${i})`
    )
  })
  lines.push(
    'ping -n 2 127.0.0.1 >nul',
    `start "" ${batQuote(exe)}${args.length ? ' ' + args.join(' ') : ''}`,
    '(goto) 2>nul & del "%~f0"'
  )
  const bat = join(app.getPath('temp'), `schoolmod-update-${Date.now()}.cmd`)
  writeFileSync(bat, lines.join('\r\n') + '\r\n')

  const child = spawn('cmd.exe', ['/d', '/c', batQuote(bat)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true
  })
  child.unref()
}

/**
 * Downloads and installs the latest release, then quits so it can take over.
 * Portable: the new SchoolMod-x.y.z-Portable.exe is saved next to the current
 * one and launched. Installed: the setup runs silently over the existing
 * install and reopens SchoolMod. Elsewhere: opens the release page.
 */
export async function install(onProgress: (fraction: number) => void): Promise<{ action: 'restarting' | 'opened'; path?: string }> {
  if (!latestRelease) await check()
  const release = latestRelease
  if (!release) throw new Error('No SchoolMod release found on GitHub.')

  const kind = installKind()
  const asset = assetFor(release, kind)
  if (kind === 'manual' || !asset) {
    await shell.openExternal(release.html_url)
    return { action: 'opened' }
  }

  let dir = app.getPath('temp')
  if (kind === 'portable') {
    const here = dirname(process.env.PORTABLE_EXECUTABLE_FILE!)
    dir = writableDir(here) ? here : app.getPath('downloads')
  }
  const target = join(dir, asset.name)
  await download(asset, target, onProgress)

  // electron-builder's NSIS installer: /S = silent, --updated = update over the
  // existing install, --force-run = start SchoolMod again when it's done.
  launchAfterExit(target, kind === 'installer' ? ['--updated', '/S', '--force-run'] : [])
  setTimeout(() => app.quit(), 300)
  return { action: 'restarting', path: target }
}

export const version = () => currentVersion()

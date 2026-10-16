import { spawn, SpawnOptions, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join, isAbsolute } from 'path'
import { homedir } from 'os'

function quote(s: string): string {
  return /[\s"^&|<>()]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Node's spawn (no shell) doesn't do Windows PATH/PATHEXT resolution, so a bare
 * "python" fails with ENOENT even when it's on PATH. Resolve bare commands to a
 * full executable path. Extensions are tried BEFORE the bare name, because
 * spawning an extension-less shell script (e.g. nodejs/npm) fails on Windows.
 */
export function resolveCommand(cmd: string): string {
  const c = cmd.trim()
  if (!c) return c
  if (isAbsolute(c) || c.includes('/') || c.includes('\\')) return c
  if (process.platform !== 'win32') return c
  const exts = (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
  const dirs = (process.env.PATH || '').split(';').filter(Boolean)
  for (const dir of dirs) {
    for (const ext of [...exts, '']) {
      const full = join(dir, c + ext)
      if (existsSync(full)) return full
    }
  }
  return c
}

/**
 * Locate a globally-installed CLI (claude, codex, …). PATH alone is not enough:
 * npm's global bin (%APPDATA%\npm on Windows) is frequently NOT on the PATH that
 * a GUI app inherits, which is why `spawn claude` died with ENOENT. So we also
 * probe the well-known global install locations.
 */
export function findExecutable(name: string, configured?: string): string {
  // 1. An explicit path that actually exists wins.
  if (configured && (isAbsolute(configured) || /[\\/]/.test(configured)) && existsSync(configured)) {
    return configured
  }
  // 2. PATH.
  const fromPath = resolveCommand(name)
  if (fromPath !== name && existsSync(fromPath)) return fromPath

  // 3. Well-known global install locations.
  const win = process.platform === 'win32'
  const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const candidates = win
    ? [
        join(appData, 'npm', `${name}.cmd`),
        join(appData, 'npm', `${name}.exe`),
        join(homedir(), 'AppData', 'Local', 'Programs', name, `${name}.exe`),
        join(homedir(), '.bun', 'bin', `${name}.exe`)
      ]
    : [
        `/usr/local/bin/${name}`,
        `/opt/homebrew/bin/${name}`,
        join(homedir(), '.npm-global', 'bin', name),
        join(homedir(), '.local', 'bin', name),
        join(homedir(), '.volta', 'bin', name),
        join(homedir(), '.bun', 'bin', name),
        join(homedir(), 'node_modules', '.bin', name)
      ]
  for (const c of candidates) if (c && existsSync(c)) return c

  return name // last resort — will surface a clear ENOENT
}

/**
 * Node 18.20+/20.12+/24 refuse to spawn Windows .cmd/.bat files unless
 * shell:true (the CVE-2024-27980 hardening) — otherwise you get EINVAL.
 * npm.cmd and claude.cmd are exactly that, so route them through a shell with
 * our own quoting. Everything else spawns normally (no shell = safest).
 *
 * NOTE: callers should pass large/untrusted text via stdin, never argv, so it
 * never has to survive cmd.exe parsing.
 */
export function spawnSafe(cmd: string, args: string[] = [], opts: SpawnOptions = {}): ChildProcess {
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)
  if (needsShell) {
    return spawn(quote(cmd), args.map(quote), { ...opts, shell: true, windowsHide: true })
  }
  return spawn(cmd, args, { ...opts, windowsHide: true })
}

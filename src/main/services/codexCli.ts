import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { spawnSafe, findExecutable } from './proc'
import { getSettings, setSettings } from '../store'
import { ChatMessage } from '../../shared/types'

/**
 * ChatGPT support via OpenAI's Codex CLI (`@openai/codex`), which signs in with
 * a ChatGPT account. Mirrors claudeCli: one-click install, login (surfaces the
 * auth URL), then non-interactive `codex exec` for chat.
 */

function codexCmd(): string {
  const s = getSettings()
  const found = findExecutable('codex', s.codex?.cliPath)
  if (found !== 'codex' && found !== s.codex?.cliPath) {
    setSettings({ codex: { ...s.codex, cliPath: found } })
  }
  return found
}

function workdir(): string {
  const dir = join(app.getPath('userData'), 'codex-workdir')
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function status(): Promise<{ installed: boolean; authenticated: boolean; version: string }> {
  const cmd = codexCmd()
  if (cmd === 'codex') return { installed: false, authenticated: false, version: '' }
  const version = await new Promise<string>((resolve) => {
    const c = spawnSafe(cmd, ['--version'], { cwd: workdir() })
    let out = ''
    c.stdout!.on('data', (d) => (out += d))
    c.on('error', () => resolve(''))
    c.on('close', () => resolve(out.trim()))
  })
  if (!version) return { installed: false, authenticated: false, version: '' }
  // Probe auth with a trivial prompt.
  const probe = await new Promise<{ ok: boolean; text: string }>((resolve) => {
    const c = spawnSafe(cmd, ['exec', '--skip-git-repo-check', 'Reply with: ok'], { cwd: workdir() })
    let out = ''
    let err = ''
    c.stdout!.on('data', (d) => (out += d))
    c.stderr!.on('data', (d) => (err += d))
    c.on('error', () => resolve({ ok: false, text: '' }))
    c.on('close', (code) => resolve({ ok: code === 0, text: out + err }))
  })
  const authed = probe.ok && !/not logged in|login|unauthor|sign in/i.test(probe.text)
  return { installed: true, authenticated: authed, version }
}

export function install(onLog: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = findExecutable('npm')
    const child = spawnSafe(npm, ['install', '-g', '@openai/codex'])
    child.stdout!.on('data', (d) => onLog(String(d)))
    child.stderr!.on('data', (d) => onLog(String(d)))
    child.on('error', (e) => reject(new Error(`npm install failed: ${e.message}`)))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`npm exited with code ${code}. Is Node.js installed?`))
      const found = codexCmd()
      onLog(found === 'codex' ? 'Installed, but could not locate the codex binary.' : `Found Codex at ${found}`)
      resolve()
    })
  })
}

/** Runs `codex login`, surfacing the ChatGPT authorisation URL. */
export function login(onLog: (line: string) => void, onUrl: (url: string) => void): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    const child = spawnSafe(codexCmd(), ['login'], { cwd: workdir() })
    let sentUrl = false
    const scan = (s: string) => {
      onLog(s)
      const m = s.match(/https?:\/\/[^\s'"]+/)
      if (m && !sentUrl) {
        sentUrl = true
        onUrl(m[0])
      }
    }
    child.stdout!.on('data', (d) => scan(String(d)))
    child.stderr!.on('data', (d) => scan(String(d)))
    child.on('error', (e) => {
      onLog(`Error: ${e.message}`)
      resolve({ ok: false })
    })
    child.on('close', (code) => resolve({ ok: code === 0 }))
  })
}

function buildPrompt(messages: ChatMessage[]): string {
  const system = messages.find((m) => m.role === 'system')?.content || ''
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n\n')
  return system ? `${system}\n\n---\n\n${convo}` : convo
}

/**
 * Codex exec is not token-streaming friendly, so we emit the answer once it
 * lands. onDelta still fires so the UI code path is identical to Claude's.
 */
export async function chatStream(
  messages: ChatMessage[],
  onDelta: (delta: string) => void
): Promise<string> {
  const prompt = buildPrompt(messages)
  const cmd = codexCmd()
  if (cmd === 'codex') throw new Error('Codex CLI not found. Click Connect in Settings.')

  const text = await new Promise<string>((resolve, reject) => {
    const child = spawnSafe(cmd, ['exec', '--skip-git-repo-check', '-'], { cwd: workdir() })
    let out = ''
    let err = ''
    child.stdout!.on('data', (d) => (out += d))
    child.stderr!.on('data', (d) => (err += d))
    child.on('error', (e) => reject(new Error(`Could not run "codex": ${e.message}`)))
    child.on('close', (code) => {
      if (code !== 0 && !out.trim()) reject(new Error(err.trim() || 'Codex returned an error.'))
      else resolve(out)
    })
    child.stdin!.write(prompt)
    child.stdin!.end()
  })

  // Strip Codex's log/banner lines so only the answer remains.
  const answer = text
    .split('\n')
    .filter((l) => !/^\s*(\[|codex\s|OpenAI Codex|model:|workdir:|provider:|approval:|sandbox:|reasoning)/i.test(l))
    .join('\n')
    .trim()
  onDelta(answer)
  return answer
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  let full = ''
  await chatStream(messages, (d) => (full += d))
  const t = full.trim()
  if (t.length < 400) {
    if (/rate limit|too many requests|quota/i.test(t)) throw new Error('ChatGPT is rate-limited right now. Try again shortly.')
    if (/not logged in|unauthor|sign in|401/i.test(t)) throw new Error('Codex is not signed in. Open Settings → AI provider → Connect.')
  }
  return full
}

import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { spawnSafe, resolveCommand, findExecutable } from './proc'
import { getSettings, setSettings } from '../store'
import { ChatMessage } from '../../shared/types'

/**
 * Drives Claude directly through the Claude Code CLI (`claude -p`), using the
 * user's own Claude subscription auth. No separate wrapper/server needed — a
 * one-click Connect installs the CLI and walks the user through login.
 */

/**
 * Locate the Claude Code CLI, remembering wherever we find it. npm's global bin
 * is often missing from a GUI app's PATH, so we probe known locations too.
 */
function claudeCmd(): string {
  const s = getSettings()
  const found = findExecutable('claude', s.claude.cliPath)
  if (found !== 'claude' && found !== s.claude.cliPath) {
    setSettings({ claude: { ...s.claude, cliPath: found } })
  }
  return found
}

/** A clean, empty working dir so the study chat doesn't inherit any project's CLAUDE.md/tools. */
function workdir(): string {
  const dir = join(app.getPath('userData'), 'claude-workdir')
  mkdirSync(dir, { recursive: true })
  return dir
}

function run(
  args: string[],
  onLine?: (line: string) => void,
  input?: string
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnSafe(claudeCmd(), args, { cwd: workdir() })
    let out = ''
    let err = ''
    let buf = ''
    child.stdout!.on('data', (d) => {
      out += d
      if (onLine) {
        buf += d
        const parts = buf.split('\n')
        buf = parts.pop() || ''
        for (const p of parts) onLine(p)
      }
    })
    child.stderr!.on('data', (d) => (err += d))
    child.on('error', (e) => reject(new Error(`Could not run "claude" (${claudeCmd()}): ${e.message}`)))
    child.on('close', (code) => {
      if (onLine && buf) onLine(buf)
      resolve({ code: code ?? 0, out, err })
    })
    if (input !== undefined) {
      child.stdin!.write(input)
      child.stdin!.end()
    }
  })
}

export async function status(): Promise<{ installed: boolean; authenticated: boolean; version: string }> {
  let version = ''
  try {
    const v = await run(['--version'])
    version = v.out.trim()
    if (!version) return { installed: false, authenticated: false, version: '' }
  } catch {
    return { installed: false, authenticated: false, version: '' }
  }
  // Probe auth with a tiny prompt (sent via stdin, never argv).
  try {
    const r = await run(['-p', '--output-format', 'text'], undefined, 'Reply with: ok')
    const authed = !/invalid api key|not logged in|please run|authentication|login/i.test(r.err + r.out) && r.code === 0
    return { installed: true, authenticated: authed, version }
  } catch {
    return { installed: true, authenticated: false, version }
  }
}

export function install(onLog: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = findExecutable('npm')
    const child = spawnSafe(npm, ['install', '-g', '@anthropic-ai/claude-code'])
    child.stdout!.on('data', (d) => onLog(String(d)))
    child.stderr!.on('data', (d) => onLog(String(d)))
    child.on('error', (e) => reject(new Error(`npm install failed: ${e.message}`)))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`npm exited with code ${code}. Is Node.js installed?`))
      // Re-discover and persist where npm just put it (its bin dir is often not on PATH).
      const found = claudeCmd()
      onLog(found === 'claude' ? 'Installed, but could not locate the claude binary.' : `Found Claude Code at ${found}`)
      resolve()
    })
  })
}

/**
 * Starts `claude setup-token`, surfacing the OAuth URL to the renderer. Resolves
 * when the CLI reports success. onUrl fires with the authorisation URL to open.
 */
export function login(onLog: (line: string) => void, onUrl: (url: string) => void): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    const child = spawnSafe(claudeCmd(), ['setup-token'], { cwd: workdir() })
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

/** Everything (system + running conversation) goes through stdin as one prompt. */
function buildPrompt(messages: ChatMessage[]): string {
  const system = messages.find((m) => m.role === 'system')?.content || ''
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n\n')
  return system ? `${system}\n\n---\n\n${convo}` : convo
}

export async function chatStream(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  model?: string
): Promise<string> {
  const prompt = buildPrompt(messages)
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    model || getSettings().claude.model || 'claude-sonnet-5',
    '--disallowedTools',
    'Bash,Edit,Write,Read' // pure Q&A — don't let it touch the machine
  ]

  let full = ''
  let errText = ''
  await new Promise<void>((resolve, reject) => {
    const child = spawnSafe(claudeCmd(), args, { cwd: workdir() })
    let buf = ''
    child.stdout!.on('data', (d) => {
      buf += d
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        try {
          const ev = JSON.parse(t)
          if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta') {
            const delta = ev.event.delta?.text || ''
            if (delta) {
              full += delta
              onDelta(delta)
            }
          } else if (ev.type === 'result' && typeof ev.result === 'string' && !full) {
            full = ev.result
            onDelta(ev.result)
          }
        } catch {
          /* ignore non-JSON lines */
        }
      }
    })
    child.stderr!.on('data', (d) => (errText += d))
    child.on('error', (e) => reject(new Error(`Could not run "claude": ${e.message}`)))
    child.on('close', (code) => {
      if (code !== 0 && !full) reject(new Error(errText.trim() || 'Claude CLI returned an error. Try Connect in Settings.'))
      else resolve()
    })
    // Prompt via stdin so it never has to survive cmd.exe parsing.
    child.stdin!.write(prompt)
    child.stdin!.end()
  })
  return full
}

/**
 * The CLI exits 0 and prints these as if they were an answer, which would
 * otherwise be shown to the student as Claude's reply. Surface them as errors.
 */
const CLI_NOTICES: { re: RegExp; msg: (m: RegExpMatchArray) => string }[] = [
  {
    re: /you'?ve hit your (session|usage) limit[^\n]*/i,
    msg: (m) => `Claude ${m[0].replace(/^you'?ve hit your /i, '')}. Your subscription's limit will reset — try again then, or switch to ChatGPT/Codex in Settings.`
  },
  { re: /rate limit|too many requests/i, msg: () => 'Claude is rate-limited right now. Wait a moment and try again.' },
  { re: /not logged in|please run\s*\/?login|invalid api key|authentication/i, msg: () => 'Claude Code is not signed in. Open Settings → AI provider → Connect.' },
  { re: /credit balance is too low|insufficient/i, msg: () => 'Your Claude account is out of credit for now.' }
]

export function assertNotNotice(text: string) {
  const t = (text || '').trim()
  // Only treat short replies as notices — a long answer that merely mentions
  // "rate limit" is a real answer, not an error.
  if (t.length > 400) return
  for (const n of CLI_NOTICES) {
    const m = t.match(n.re)
    if (m) throw new Error(n.msg(m))
  }
}

export async function chat(messages: ChatMessage[], model?: string): Promise<string> {
  let full = ''
  await chatStream(messages, (d) => (full += d), model)
  assertNotNotice(full)
  return full
}

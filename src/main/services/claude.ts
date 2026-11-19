import OpenAI from 'openai'
import { getSettings } from '../store'
import { ChatMessage } from '../../shared/types'
import * as cli from './claudeCli'
import * as codex from './codexCli'

const mode = () => getSettings().claude.mode
const isCli = () => mode() === 'cli' || (mode() !== 'wrapper' && mode() !== 'codex')
const isCodex = () => mode() === 'codex'

/**
 * Talks to the claude-code-openai-wrapper
 * (https://github.com/RichardAtCT/claude-code-openai-wrapper), which exposes an
 * OpenAI-compatible /v1/chat/completions endpoint backed by the user's Claude
 * Code / Claude subscription. Because it is OpenAI-compatible we just use the
 * official openai SDK pointed at the wrapper's baseUrl.
 */
function client(): OpenAI {
  const { claude } = getSettings()
  return new OpenAI({
    baseURL: claude.baseUrl,
    apiKey: claude.apiKey || 'schoolmod',
    dangerouslyAllowBrowser: false
  })
}

export async function ping(): Promise<{ ok: boolean; detail: string }> {
  if (isCodex()) {
    const s = await codex.status()
    if (!s.installed) return { ok: false, detail: 'Codex CLI is not installed. Click Connect to install it.' }
    if (!s.authenticated) return { ok: false, detail: 'Codex is installed but not signed in. Click Connect.' }
    return { ok: true, detail: `Connected via Codex ${s.version}` }
  }
  if (isCli()) {
    const s = await cli.status()
    if (!s.installed) return { ok: false, detail: 'Claude Code is not installed. Click Connect to install it.' }
    if (!s.authenticated) return { ok: false, detail: 'Claude Code is installed but not logged in. Click Connect.' }
    return { ok: true, detail: `Connected via Claude Code CLI ${s.version}` }
  }
  const { claude } = getSettings()
  try {
    const base = claude.baseUrl.replace(/\/v1\/?$/, '')
    const res = await fetch(`${base}/health`, { method: 'GET' })
    if (res.ok) return { ok: true, detail: await res.text() }
    // fall back to a models call
  } catch {
    /* try models next */
  }
  try {
    const models = await client().models.list()
    return { ok: true, detail: `Connected. Models: ${models.data.map((m) => m.id).join(', ')}` }
  } catch (e: any) {
    return { ok: false, detail: e?.message || 'Could not reach the Claude wrapper.' }
  }
}

export async function chat(messages: ChatMessage[], model?: string): Promise<string> {
  if (isCodex()) return codex.chat(messages)
  if (isCli()) return cli.chat(messages, model)
  const { claude } = getSettings()
  const res = await client().chat.completions.create({
    model: model || claude.model,
    messages: messages as any,
    temperature: 0.4
  })
  return res.choices[0]?.message?.content ?? ''
}

/** Streams a completion, invoking onDelta with each text chunk. */
export async function chatStream(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  model?: string
): Promise<string> {
  if (isCodex()) return codex.chatStream(messages, onDelta)
  if (isCli()) return cli.chatStream(messages, onDelta, model)
  const { claude } = getSettings()
  let full = ''
  const stream = await client().chat.completions.create({
    model: model || claude.model,
    messages: messages as any,
    temperature: 0.4,
    stream: true
  })
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content ?? ''
    if (delta) {
      full += delta
      onDelta(delta)
    }
  }
  return full
}

/** Convenience: single-shot prompt used by notebooks / flashcards generators. */
export async function complete(system: string, user: string, model?: string): Promise<string> {
  return chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    model
  )
}

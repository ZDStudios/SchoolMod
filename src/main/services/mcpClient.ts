import { existsSync } from 'fs'
import { join, isAbsolute } from 'path'
import { SeqtaMcpConfig } from '../../shared/types'

// Command resolution lives in proc.ts. Imported for local use AND re-exported
// for existing importers — a bare `export ... from` would not bind it here.
import { resolveCommand } from './proc'
export { resolveCommand }

/**
 * Minimal MCP host: SchoolMod spawns an MCP server (the user's Seqta-MCP-Server)
 * over stdio and calls its tools. The @modelcontextprotocol/sdk is ESM-only, so
 * we load it via dynamic import() to stay compatible with the CJS main bundle.
 * A single connection is cached and reused; it reconnects if the config changes.
 */

let cached: { key: string; client: any; transport: any } | null = null
// Dedupe concurrent connects (e.g. the dashboard firing several SEQTA calls at
// once) so we only ever spawn one server process per config.
let pending: { key: string; promise: Promise<any> } | null = null

function keyOf(cfg: SeqtaMcpConfig) {
  return JSON.stringify([cfg.command, cfg.args, cfg.cwd])
}

async function connect(cfg: SeqtaMcpConfig): Promise<any> {
  if (!cfg.command?.trim()) {
    throw new Error('No MCP server command set. Configure it in Settings → SEQTA.')
  }
  const key = keyOf(cfg)
  if (cached && cached.key === key) return cached.client
  if (pending && pending.key === key) return pending.promise

  const promise = (async () => {
    if (cached) {
      try {
        await cached.client.close()
      } catch {
        /* ignore */
      }
      cached = null
    }
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
    const transport = new StdioClientTransport({
      command: resolveCommand(cfg.command),
      args: (cfg.args || []).filter(Boolean),
      cwd: cfg.cwd?.trim() || undefined,
      stderr: 'ignore'
    })
    const client = new Client({ name: 'schoolmod', version: '2.0.0' }, { capabilities: {} })
    await client.connect(transport)
    cached = { key, client, transport }
    return client
  })()

  pending = { key, promise }
  try {
    return await promise
  } finally {
    if (pending?.key === key) pending = null
  }
}

/** Some servers wrap their string return in {"result": "..."} — unwrap that. */
function unwrap(text: string): string {
  const t = text.trim()
  if (t.startsWith('{') && t.includes('"result"')) {
    try {
      const j = JSON.parse(t)
      if (typeof j.result === 'string') return j.result
    } catch {
      /* fall through */
    }
  }
  return text
}

export async function callTool(
  cfg: SeqtaMcpConfig,
  name: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const client = await connect(cfg)
  const res: any = await client.callTool({ name, arguments: args })
  const text = (res?.content || [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
  return unwrap(text)
}

export async function listTools(cfg: SeqtaMcpConfig): Promise<string[]> {
  const client = await connect(cfg)
  const res: any = await client.listTools()
  return (res?.tools || []).map((t: any) => t.name)
}

export async function disconnect() {
  if (cached) {
    try {
      await cached.client.close()
    } catch {
      /* ignore */
    }
    cached = null
  }
}

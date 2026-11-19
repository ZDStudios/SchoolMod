import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getSettings, setSettings } from '../store'

/**
 * Microsoft 365 integration via the Microsoft identity platform + Graph API.
 * Uses the OAuth 2.0 device-code flow (no client secret, no extra deps) so the
 * user just needs to register a free public-client Azure AD app and paste its
 * client id into Settings. Tokens are cached; the refresh token is persisted so
 * the user stays signed in between launches.
 */

const SCOPES =
  'offline_access User.Read Notes.ReadWrite.All Files.ReadWrite.All Chat.Read Tasks.ReadWrite Calendars.Read Mail.Read'

interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}
let tokens: Tokens | null = null

function tokenPath() {
  return join(app.getPath('userData'), 'store', 'ms-token.json')
}
function loadTokens() {
  try {
    if (existsSync(tokenPath())) tokens = JSON.parse(readFileSync(tokenPath(), 'utf-8'))
  } catch {
    tokens = null
  }
}
function saveTokens() {
  if (tokens) writeFileSync(tokenPath(), JSON.stringify(tokens), 'utf-8')
}
loadTokens()

function tenant() {
  return getSettings().microsoft.tenant || 'common'
}
function clientId() {
  const id = getSettings().microsoft.clientId.trim()
  if (!id) throw new Error('No Microsoft client id set. Add your Azure app id in Settings → Microsoft.')
  return id
}

export async function startDeviceLogin(
  onDone: (result: { ok: boolean; account?: string; error?: string }) => void
): Promise<{ userCode: string; verificationUri: string; message: string; expiresIn: number }> {
  const body = new URLSearchParams({ client_id: clientId(), scope: SCOPES })
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const data = await res.json()
  if (!data.device_code) throw new Error(data.error_description || 'Device code request failed.')

  // Poll for the token in the background.
  const deadline = Date.now() + data.expires_in * 1000
  const poll = async () => {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, (data.interval || 5) * 1000))
      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            client_id: clientId(),
            device_code: data.device_code
          })
        }
      )
      const t = await tokenRes.json()
      if (t.access_token) {
        tokens = {
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt: Date.now() + (t.expires_in - 60) * 1000
        }
        saveTokens()
        try {
          const me = await graph('GET', '/me')
          setSettings({
            microsoft: { ...getSettings().microsoft, account: me.userPrincipalName || me.mail || '' }
          })
          onDone({ ok: true, account: me.userPrincipalName || me.mail })
        } catch {
          onDone({ ok: true })
        }
        return
      }
      if (t.error && t.error !== 'authorization_pending' && t.error !== 'slow_down') {
        onDone({ ok: false, error: t.error_description || t.error })
        return
      }
    }
    onDone({ ok: false, error: 'Device login timed out.' })
  }
  poll()

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    message: data.message,
    expiresIn: data.expires_in
  }
}

async function refresh(): Promise<void> {
  if (!tokens?.refreshToken) throw new Error('Not signed in to Microsoft.')
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId(),
      refresh_token: tokens.refreshToken,
      scope: SCOPES
    })
  })
  const t = await res.json()
  if (!t.access_token) throw new Error(t.error_description || 'Microsoft session expired, please reconnect.')
  tokens = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000
  }
  saveTokens()
}

export function isSignedIn(): boolean {
  return !!tokens?.refreshToken
}

export async function graph(method: string, path: string, body?: unknown): Promise<any> {
  if (!tokens) throw new Error('Not signed in to Microsoft.')
  if (Date.now() > tokens.expiresAt) await refresh()
  const doCall = async () => {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens!.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
    return res
  }
  let res = await doCall()
  if (res.status === 401) {
    await refresh()
    res = await doCall()
  }
  if (res.status === 204) return { ok: true }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Graph error ${res.status}`)
  return data
}

/** Web launch URLs for Microsoft apps (reliable across platforms). */
export const APP_URLS: Record<string, string> = {
  onenote: 'https://www.onenote.com/notebooks',
  word: 'https://www.office.com/launch/word/',
  excel: 'https://www.office.com/launch/excel/',
  powerpoint: 'https://www.office.com/launch/powerpoint/',
  teams: 'https://teams.microsoft.com/',
  outlook: 'https://outlook.office.com/mail/',
  onedrive: 'https://onedrive.live.com/',
  todo: 'https://to-do.office.com/',
  office: 'https://www.office.com/'
}

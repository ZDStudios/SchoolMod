import { app, BrowserWindow, session } from 'electron'

/**
 * SEQTA SSO login inside an Electron BrowserWindow (Electron *is* Chromium).
 *
 * Modelled on DesQTA's login window (BetterSEQTA/DesQTA, src-tauri/src/auth/login.rs):
 *  - Open the school's SEQTA URL in a real browser window and let the school's
 *    own sign-in flow run (Microsoft, ADFS, Google or plain SEQTA, plus MFA).
 *  - Poll the window's cookie jar for JSESSIONID, and only accept it once an
 *    authenticated API call succeeds with it. SEQTA hands out a JSESSIONID on
 *    the very first page load, before anyone has signed in, so its mere
 *    presence proves nothing (the old code accepted that pre-login cookie).
 *
 * On top of that, when an email/password is saved we try to finish the
 * Microsoft flow silently in a hidden window first. If that stalls (MFA, a
 * rejected password, an unfamiliar sign-in page) the window is shown so the
 * student can finish signing in themselves.
 *
 * The partition is persistent, so Microsoft's "Stay signed in" cookies survive
 * restarts: once a student has signed in (and done MFA) once, an expired SEQTA
 * session is renewed silently without showing anything.
 */

export const SSO_PARTITION = 'persist:seqta-sso'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * A login failure where falling back to the Microsoft-only helpers (Python,
 * Puppeteer) would be pointless: the student cancelled, or the school doesn't
 * use Microsoft sign-in at all.
 */
export class FinalLoginError extends Error {
  final = true
}

/** Tagged error so callers can tell "the student closed the window" from a real failure. */
export class SsoCancelledError extends FinalLoginError {
  cancelled = true
  constructor() {
    super('The SEQTA sign-in window was closed before sign-in finished.')
  }
}

/** Advances the Microsoft sign-in form one step. Shared with the Microsoft 365 login. */
export const FILL_SCRIPT = (email: string, password: string) => `(function () {
  // React-driven inputs (Microsoft's newer sign-in UI) ignore a plain .value
  // assignment, so go through the native setter before firing input/change.
  function setVal(sel, val) {
    var e = document.querySelector(sel);
    if (!e || e.value || !val) return false;
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(e, val);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function click(sel) { var e = document.querySelector(sel); if (e) { e.click(); return true; } return false; }
  var NEXT = '#idSIButton9, [data-testid="primaryButton"], input[type=submit], button[type=submit]';
  var email = ${JSON.stringify(email)}, pass = ${JSON.stringify(password)};
  var body = (document.body ? document.body.innerText : '') + ' ' + document.title;
  // "Pick an account": choose the tile for this email.
  if (email) {
    var tiles = document.querySelectorAll('#tilesHolder [role=button], #tilesHolder .table, [data-test-id]');
    for (var i = 0; i < tiles.length; i++) {
      if ((tiles[i].innerText || tiles[i].getAttribute('data-test-id') || '').toLowerCase().indexOf(email.toLowerCase()) !== -1) {
        tiles[i].click(); return 'pick';
      }
    }
  }
  // Email step
  if (document.querySelector('#i0116')) { setVal('#i0116', email); click(NEXT); return 'email'; }
  if (document.querySelector('input[type=email], input[name=loginfmt]')) {
    setVal('input[type=email], input[name=loginfmt]', email); click(NEXT); return 'email';
  }
  // Password step. 'password-filled' means we typed it in just now; Microsoft
  // clears the field after a rejected password, so seeing that twice means
  // the saved password is wrong and the caller must stop retrying.
  if (document.querySelector('#i0118')) { var f1 = setVal('#i0118', pass); click(NEXT); return f1 ? 'password-filled' : 'password'; }
  if (document.querySelector('input[type=password]')) {
    var f2 = setVal('input[type=password]', pass); click(NEXT); return f2 ? 'password-filled' : 'password';
  }
  // "Stay signed in?" (KMSI): yes, so later renewals are silent.
  if (/stay signed in|kmsi/i.test(body) && document.querySelector('#idSIButton9, [data-testid="primaryButton"]')) {
    click('#idSIButton9, [data-testid="primaryButton"]'); return 'kmsi';
  }
  return 'wait';
})()`

/** Detects pages the silent login can't get past on its own. */
const BLOCKER_SCRIPT = `(function () {
  var t = document.body ? document.body.innerText : '';
  if (document.querySelector('#idDiv_SAOTCAS_Title, #idTxtBx_SAOTCC_OTC, #idDiv_SAOTCS_Proofs, #idDiv_SAASDS_Title, input[name=otc], #idRichContext_DisplaySign') ||
      /approve (the )?sign.?in request|enter (the )?code|verify your identity|more information (is )?required|authenticator app|we.ve sent|text you a code/i.test(t)) return 'mfa';
  var e = document.querySelector('#passwordError, #usernameError, #errorText, [data-testid="errorText"]');
  if (e && e.innerText && e.innerText.trim()) return 'error:' + e.innerText.trim().slice(0, 200);
  var m = t.match(/AADSTS\\d+[^\\n]*/);
  if (m) return 'error:' + m[0].slice(0, 200);
  return '';
})()`

/**
 * If the SEQTA login page sits there instead of redirecting to the school's
 * identity provider, start SSO ourselves the same way SEQTA's own page does:
 * POST /seqta/student/login, then submit the SAML request it returns.
 * Resolves to 'saml' (redirecting), 'nosaml' (plain SEQTA login) or 'error'.
 */
const KICK_SAML_SCRIPT = `(async function () {
  try {
    var r = await fetch('/seqta/student/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ mode: 'normal', query: null, redirect_url: location.origin + '/' })
    });
    var j = await r.json();
    var p = j.payload || {};
    if (p.personUUID && !p.saml) return 'signedin';
    var s = p.saml && p.saml[0];
    if (!s || !s.url) return 'nosaml';
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = s.url;
    var fields = { SAMLRequest: s.request, RelayState: s.relaystate, SigAlg: s.sigalg, Signature: s.signature };
    for (var k in fields) {
      if (fields[k] == null) continue;
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = k; i.value = fields[k];
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
    return 'saml';
  } catch (e) {
    return 'error';
  }
})()`

export interface SsoResult {
  ok: boolean
  jsessionid: string
  personUUID: string
  id: number
  name: string
  code: string
}

/**
 * Confirms a JSESSIONID is a signed-in session (DesQTA checks /load/subjects
 * the same way) and reads the student's identity. Returns null for a
 * pre-login or expired cookie. /load/subjects runs first because calling
 * /login on a session that is mid-SSO mints a fresh SAML request and can
 * break the flow in the window.
 */
async function signedInIdentity(baseUrl: string, cookie: string): Promise<Omit<SsoResult, 'ok' | 'jsessionid'> | null> {
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    Cookie: `JSESSIONID=${cookie}`
  }
  try {
    const subj = await fetch(`${baseUrl}/seqta/student/load/subjects`, { method: 'POST', headers, body: '{}' })
    if (!subj.ok) return null
    const sj: any = await subj.json().catch(() => null)
    if (!sj || (String(sj.status) !== '200' && !Array.isArray(sj.payload))) return null

    const res = await fetch(`${baseUrl}/seqta/student/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mode: 'normal', query: null, redirect_url: `${baseUrl}/` })
    })
    const p: any = (await res.json().catch(() => null))?.payload
    if (!p?.personUUID) return null
    return { personUUID: p.personUUID, id: p.id, name: p.userDesc || '', code: p.meta?.code || '' }
  } catch {
    return null
  }
}

/** Chrome's UA without the "Electron/x" and app tokens, which some identity providers reject. */
function browserUserAgent(): string {
  const appToken = app.getName().toLowerCase() + '/'
  return app.userAgentFallback
    .split(' ')
    .filter((t) => !/^electron\//i.test(t) && !t.toLowerCase().startsWith(appToken) && !/^schoolmod\//i.test(t))
    .join(' ')
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json'
}

/**
 * Does this school's SEQTA hand sign-in to an identity provider (Microsoft
 * etc.)? An anonymous /login call returns a SAML request when it does.
 * null when the server can't be reached or answers unexpectedly.
 */
export async function usesSso(baseUrl: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${baseUrl}/seqta/student/login`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ mode: 'normal', query: null, redirect_url: `${baseUrl}/` })
    })
    const j: any = await res.json()
    return !!j?.payload?.saml?.[0]?.url
  } catch {
    return null
  }
}

/**
 * Plain SEQTA username/password login for schools without SSO. Same request
 * DesQTA's direct_login makes. Returns null if SEQTA rejects the credentials.
 */
export async function passwordLogin(baseUrl: string, username: string, password: string): Promise<SsoResult | null> {
  const res = await fetch(`${baseUrl}/seqta/student/login`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password, mode: 'normal', query: null }),
    redirect: 'manual'
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = c.match(/^\s*JSESSIONID=([^;]+)/i)
    if (!m) continue
    const who = await signedInIdentity(baseUrl, m[1])
    if (who) return { ok: true, jsessionid: m[1], ...who }
  }
  return null
}

/**
 * Sign in to SEQTA whichever way the school does it:
 *  - Regular SEQTA login: with a saved username/password, log straight in
 *    through the API. Otherwise (or if SEQTA rejects them) show SEQTA's own
 *    login page in the sign-in window.
 *  - SSO (Microsoft etc.): the silent-then-visible window flow.
 * At schools that offer both, a saved username that isn't an email is tried
 * as a SEQTA login first.
 */
export async function seqtaSignIn(
  baseUrl: string,
  username: string,
  password: string,
  opts: { interactive?: boolean } = {}
): Promise<SsoResult> {
  const user = username.trim()
  if (!user || !password) return electronSsoLogin(baseUrl, '', '', opts)

  const sso = await usesSso(baseUrl)
  if (sso === false || (sso && !user.includes('@'))) {
    const r = await passwordLogin(baseUrl, user, password).catch(() => null)
    if (r) return r
    if (sso === false) {
      // Regular school, saved details rejected: let the student type them on SEQTA's page.
      try {
        return await electronSsoLogin(baseUrl, '', '', { ...opts, reason: 'SEQTA did not accept the saved username or password' })
      } catch (e: any) {
        throw e instanceof FinalLoginError ? e : new FinalLoginError(e.message)
      }
    }
  }
  return electronSsoLogin(baseUrl, user, password, opts)
}

/** Forget the SSO browser entirely (Microsoft "stay signed in" cookies included). Used on disconnect. */
export async function clearSsoBrowser(): Promise<void> {
  await session.fromPartition(SSO_PARTITION).clearStorageData().catch(() => {})
}

export async function electronSsoLogin(
  baseUrl: string,
  email: string,
  password: string,
  opts: { interactive?: boolean; reason?: string } = {}
): Promise<SsoResult> {
  const interactive = opts.interactive ?? true
  const ses = session.fromPartition(SSO_PARTITION)
  const host = new URL(baseUrl).hostname

  // Drop any stale SEQTA cookies so we start a fresh SEQTA session, but keep
  // the identity provider's cookies: they are what makes renewal silent.
  const stale = await ses.cookies.get({ domain: host }).catch(() => [])
  await Promise.all(
    stale.map((c) =>
      ses.cookies
        .remove(`${baseUrl.startsWith('https') ? 'https' : 'http'}://${(c.domain || host).replace(/^\./, '')}${c.path || '/'}`, c.name)
        .catch(() => {})
    )
  )

  const haveCreds = !!(email && password)
  // No saved credentials: nothing to do silently, so show the window straight away.
  let visible = interactive && !haveCreds
  if (!visible && !haveCreds) {
    throw new FinalLoginError(
      `SEQTA needs you to sign in${opts.reason ? ` (${opts.reason})` : ''}. Open Settings → SEQTA and click Connect.`
    )
  }

  const win = new BrowserWindow({
    show: visible,
    width: 980,
    height: 760,
    title: 'Sign in to SEQTA',
    autoHideMenuBar: true,
    webPreferences: { partition: SSO_PARTITION, sandbox: true, nodeIntegration: false, contextIsolation: true }
  })
  win.webContents.setUserAgent(browserUserAgent())
  // Keep the window title fixed so it is obvious what this window is for.
  win.on('page-title-updated', (e) => e.preventDefault())
  // Sign-in pages occasionally open popups (e.g. "Sign in with another account"); keep them in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.loadURL(url).catch(() => {})
    return { action: 'deny' }
  })

  let closed = false
  win.on('closed', () => (closed = true))

  let reason = opts.reason || ''
  const reveal = (why: string) => {
    if (visible || closed) return
    if (!interactive) throw new Error(`SEQTA needs you to sign in again (${why}). Open Settings → SEQTA and click Connect.`)
    reason = why
    visible = true
    win.show()
    win.focus()
  }

  try {
    await win.loadURL(`${baseUrl}/`).catch(() => {
      /* a redirect aborting the first load is normal; the polling below copes */
    })

    const started = Date.now()
    const silentDeadline = started + 45_000 // silent attempt gets 45s before we ask the student
    const deadline = started + 15 * 60_000 // a visible window waits for the student for up to 15 min
    let lastHostChange = Date.now()
    let lastUrl = ''
    let kicked = false
    let passwordFills = 0

    while (Date.now() < deadline) {
      if (closed) throw new SsoCancelledError()

      let url = ''
      try {
        url = win.webContents.getURL()
      } catch {
        /* window torn down between checks */
      }
      if (url !== lastUrl) {
        lastUrl = url
        lastHostChange = Date.now()
      }
      let onSeqta = false
      try {
        onSeqta = !!url && new URL(url).hostname === host
      } catch {
        /* about:blank etc. */
      }

      // 1. Signed in? Only trust the cookie once the API accepts it.
      if (onSeqta) {
        const cookies = await ses.cookies.get({ url: baseUrl, name: 'JSESSIONID' }).catch(() => [])
        for (const c of cookies) {
          const who = await signedInIdentity(baseUrl, c.value)
          if (who) return { ok: true, jsessionid: c.value, ...who }
        }
      }

      if (!visible) {
        // 2. Silent mode: drive the sign-in pages with the saved credentials.
        if (onSeqta && !kicked && Date.now() - lastHostChange > 4000) {
          // SEQTA's page didn't redirect to the identity provider on its own.
          kicked = true
          const r = await win.webContents.executeJavaScript(KICK_SAML_SCRIPT, true).catch(() => 'error')
          if (r === 'nosaml') reveal('this school signs in on the SEQTA page itself')
        } else if (!onSeqta) {
          const blocker: string = await win.webContents.executeJavaScript(BLOCKER_SCRIPT, true).catch(() => '')
          if (blocker === 'mfa') reveal('your school needs a second sign-in step')
          else if (blocker.startsWith('error:')) reveal(`sign-in error: ${blocker.slice(6)}`)
          else {
            const step: string = await win.webContents
              .executeJavaScript(FILL_SCRIPT(email, password), true)
              .catch(() => 'wait')
            if (step === 'password-filled' && ++passwordFills > 1) reveal('the saved password was not accepted')
          }
        }
        if (!visible && Date.now() > silentDeadline) reveal('automatic sign-in took too long')
      }

      await sleep(1000)
    }

    throw new Error(
      reason ? `SEQTA sign-in timed out (${reason}).` : 'SEQTA sign-in timed out. Check the portal URL and try again.'
    )
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

import { BrowserWindow, session } from 'electron'

/**
 * Zero-dependency SEQTA SSO: drive Microsoft's login inside a hidden Electron
 * BrowserWindow (Electron *is* Chromium), then read the httpOnly JSESSIONID
 * cookie via the session API. No Python, no Puppeteer, no external browser —
 * it "just works" in the packaged/portable app.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const FILL_SCRIPT = (email: string, password: string) => `(function () {
  function setVal(sel, val) {
    var e = document.querySelector(sel);
    if (e && !e.value) { e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); return true; }
    return false;
  }
  function click(sel) { var e = document.querySelector(sel); if (e) { e.click(); return true; } return false; }
  var email = ${JSON.stringify(email)}, pass = ${JSON.stringify(password)};
  var body = (document.body ? document.body.innerText : '') + ' ' + document.title;
  // Email step
  if (document.querySelector('#i0116')) { setVal('#i0116', email); click('#idSIButton9'); return 'email'; }
  if (document.querySelector('input[type=email]')) { setVal('input[type=email]', email); click('input[type=submit]'); return 'email'; }
  // Password step
  if (document.querySelector('#i0118')) { setVal('#i0118', pass); click('#idSIButton9'); return 'password'; }
  if (document.querySelector('input[type=password]')) { setVal('input[type=password]', pass); click('input[type=submit], button[type=submit]'); return 'password'; }
  // "Stay signed in?" (KMSI)
  if (/stay signed in|kmsi/i.test(body) && document.querySelector('#idSIButton9')) { click('#idSIButton9'); return 'kmsi'; }
  return 'wait';
})()`

export async function electronSsoLogin(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ ok: boolean; jsessionid: string; personUUID: string; id: number; name: string; code: string }> {
  const partition = 'seqta-sso'
  const ses = session.fromPartition(partition)
  // Fresh start so a stale/expired attempt can't get stuck.
  await ses.clearStorageData().catch(() => {})

  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 800,
    webPreferences: { partition, sandbox: true, nodeIntegration: false, contextIsolation: true }
  })

  try {
    await win.loadURL(`${baseUrl}/`)
    const deadline = Date.now() + 90000
    let jsessionid = ''

    while (Date.now() < deadline) {
      // Already have the SEQTA cookie?
      const cookies = await ses.cookies.get({ url: baseUrl, name: 'JSESSIONID' }).catch(() => [])
      if (cookies.length && win.webContents.getURL().startsWith(baseUrl)) {
        jsessionid = cookies[0].value
        break
      }
      // Otherwise, advance the Microsoft login form.
      try {
        await win.webContents.executeJavaScript(FILL_SCRIPT(email, password), true)
      } catch {
        /* page mid-navigation; retry next tick */
      }
      // Detect wrong-credentials error early.
      const err = await win.webContents
        .executeJavaScript(`(document.body?document.body.innerText:'').match(/AADSTS\\d+|incorrect|didn.t work/i)?RegExp.lastMatch:''`, true)
        .catch(() => '')
      if (err && /AADSTS50126|AADSTS50034|incorrect|didn/i.test(err)) {
        throw new Error('Microsoft rejected the email or password.')
      }
      await sleep(1400)
    }

    if (!jsessionid) throw new Error('SSO login timed out. Check your email/password, or try the MCP option.')

    const info = await win.webContents.executeJavaScript(
      `fetch(${JSON.stringify(baseUrl + '/seqta/student/login')}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ mode: 'normal', query: null, redirect_url: ${JSON.stringify(baseUrl + '/')} })
      }).then(r => r.json()).then(j => {
        var p = j.payload || {};
        return { personUUID: p.personUUID, id: p.id, name: p.userDesc || '', code: (p.meta || {}).code || '' };
      })`,
      true
    )

    if (!info?.personUUID) throw new Error('Signed in but could not read your SEQTA profile.')
    return { ok: true, jsessionid, ...info }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

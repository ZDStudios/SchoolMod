import { BrowserWindow, session } from 'electron'
import { getSettings, setSettings } from '../store'
import { FILL_SCRIPT } from './seqtaElectron'

/**
 * Microsoft 365 without an Azure app registration.
 *
 * Instead of the device-code/Graph flow (which needs the user to register their
 * own Azure app), we sign in to office.com inside a hidden Electron window using
 * the same school Microsoft account already used for SEQTA, keep the session in
 * a persistent partition, and read the web apps' DOM for recent files/notebooks.
 *
 * This is deliberately best-effort: Microsoft's markup changes, so every
 * selector below is defensive and failure degrades to "no items found".
 */

const PARTITION = 'persist:ms365'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface MsFile {
  name: string
  url: string
  app: string
}

function creds(): { email: string; password: string } {
  const s = getSettings()
  // Falls back to the SEQTA credentials — at SSO schools it's the same account.
  const email = s.microsoft.account || s.seqta.email
  const password = s.seqta.password
  if (!email || !password) {
    throw new Error('Add your school email and password in Settings → SEQTA first (same Microsoft account).')
  }
  return { email, password }
}

function makeWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
}

/** True once we're on a Microsoft app page and not sitting on a login form. */
async function isSignedIn(win: BrowserWindow): Promise<boolean> {
  const url = win.webContents.getURL()
  if (/login\.microsoftonline\.com|login\.live\.com/i.test(url)) return false
  return /office\.com|cloud\.microsoft|onenote\.com|sharepoint\.com|office365\.com/i.test(url)
}

/** Signs in (if needed) and leaves the window on `startUrl`. Caller destroys it. */
async function openSignedIn(startUrl: string, timeoutMs = 90000): Promise<BrowserWindow> {
  const { email, password } = creds()
  const win = makeWindow()
  try {
    await win.loadURL(startUrl)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await isSignedIn(win)) {
        await win.webContents.executeJavaScript('1').catch(() => {})
        return win
      }
      await win.webContents.executeJavaScript(FILL_SCRIPT(email, password), true).catch(() => {})
      const err = await win.webContents
        .executeJavaScript(`(document.body?document.body.innerText:'').match(/AADSTS\\d+|didn.t work|incorrect/i)?RegExp.lastMatch:''`, true)
        .catch(() => '')
      if (err && /AADSTS50126|incorrect|didn/i.test(String(err))) {
        throw new Error('Microsoft rejected the email or password.')
      }
      await sleep(1500)
    }
    throw new Error('Microsoft sign-in timed out.')
  } catch (e) {
    if (!win.isDestroyed()) win.destroy()
    throw e
  }
}

/** Sign in and remember the account — this is the whole "connect" step. */
export async function connect(): Promise<{ account: string }> {
  const ses = session.fromPartition(PARTITION)
  await ses.clearStorageData().catch(() => {})
  const win = await openSignedIn('https://www.office.com/')
  try {
    const account = await win.webContents
      .executeJavaScript(
        `(function(){
           var el = document.querySelector('[data-automation-id="meControlNameText"], #mectrl_currentAccount_secondary, #O365_UniversalMeButton');
           var t = el ? el.innerText : '';
           var m = (document.body.innerText||'').match(/[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}/i);
           return (t && t.indexOf('@') > -1) ? t.trim() : (m ? m[0] : '');
         })()`,
        true
      )
      .catch(() => '')
    const email = String(account || creds().email)
    setSettings({ microsoft: { ...getSettings().microsoft, account: email } })
    return { account: email }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/**
 * Office web apps are slow single-page apps, so poll until items appear rather
 * than guessing a fixed delay (a fixed wait returned almost nothing).
 */
async function scrapeUntil(win: BrowserWindow, script: string, want = 3, timeoutMs = 11000): Promise<MsFile[]> {
  const deadline = Date.now() + timeoutMs
  let best: MsFile[] = []
  while (Date.now() < deadline) {
    const items = await win.webContents.executeJavaScript(script, true).catch(() => [])
    if (Array.isArray(items) && items.length > best.length) best = items
    if (best.length >= want) break
    await sleep(1500)
  }
  return best
}

const FILE_SCRIPT = `(function(){
  var out = [], seen = {};
  var links = document.querySelectorAll('a[href]');
  for (var i = 0; i < links.length; i++) {
    var a = links[i], href = a.href || '';
    if (!/sharepoint\\.com|officeapps|onedrive|:w:|:x:|:p:|:o:|\\.docx|\\.xlsx|\\.pptx|\\.one/i.test(href)) continue;
    if (/login|logout|signin|myaccount|\\/_layouts\\//i.test(href)) continue;
    var name = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '').trim().split('\\n')[0];
    if (!name || name.length < 2 || name.length > 160) continue;
    if (seen[name]) continue;
    seen[name] = 1;
    var app = /:w:|\\.docx/i.test(href) ? 'Word'
            : /:x:|\\.xlsx/i.test(href) ? 'Excel'
            : /:p:|\\.pptx/i.test(href) ? 'PowerPoint'
            : /:o:|onenote|\\.one/i.test(href) ? 'OneNote' : 'OneDrive';
    out.push({ name: name, url: href, app: app });
    if (out.length >= 25) break;
  }
  return out;
})()`

/** Scrape recent documents from the Office home feed. */
export async function recentFiles(): Promise<MsFile[]> {
  const win = await openSignedIn('https://m365.cloud.microsoft/')
  try {
    let files = await scrapeUntil(win, FILE_SCRIPT, 5)
    // Only pay for the fallback navigation if the feed gave us nothing at all.
    if (files.length === 0) {
      await win.loadURL('https://www.office.com/launch/onedrive').catch(() => {})
      files = await scrapeUntil(win, FILE_SCRIPT, 5)
    }
    return files
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** Scrape the OneNote notebook list. */
export async function oneNoteNotebooks(): Promise<MsFile[]> {
  const win = await openSignedIn('https://www.onenote.com/notebooks')
  try {
    return await scrapeUntil(
      win,
      `(function(){
         var out = [], seen = {};
         var nodes = document.querySelectorAll('a[href], [role="listitem"], [class*="notebook" i]');
         for (var i = 0; i < nodes.length; i++) {
           var el = nodes[i];
           var href = el.href || (el.querySelector('a[href]') ? el.querySelector('a[href]').href : '');
           if (href && /login|signin/i.test(href)) continue;
           var name = (el.innerText || el.getAttribute('aria-label') || '').trim().split('\\n')[0];
           if (!name || name.length < 2 || name.length > 120 || seen[name]) continue;
           if (/^(sign|open|new|help|settings|home|search|more)/i.test(name)) continue;
           seen[name] = 1;
           out.push({ name: name, url: href || 'https://www.onenote.com/notebooks', app: 'OneNote' });
           if (out.length >= 25) break;
         }
         return out;
       })()`,
      3
    )
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export function isConnected(): boolean {
  return !!getSettings().microsoft.account
}

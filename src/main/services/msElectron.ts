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

/**
 * Clicking a notebook row calls window.open() to a SharePoint-hosted editor
 * URL (…/Doc.aspx?...&action=edit) — confirmed by intercepting the call
 * directly. Electron denies popups with no handler, which is why clicks
 * silently did nothing. We deny the popup too (no second window) but capture
 * its target URL so the caller can navigate the same window there instead.
 */
function makeWindow(): { win: BrowserWindow; lastPopupUrl: () => string } {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  let popupUrl = ''
  win.webContents.setWindowOpenHandler((details) => {
    popupUrl = details.url
    return { action: 'deny' }
  })
  return { win, lastPopupUrl: () => popupUrl }
}

/**
 * Some Microsoft 365 web apps (onenote.cloud.microsoft, office.com) show a
 * logged-OUT marketing landing page — complete with "Sign in" buttons — at the
 * exact same URL a signed-in session would use. A URL-only check therefore
 * false-positived as "signed in" while sitting on the marketing page, which is
 * why the scraper found "Sign up for free" instead of any notebooks. This
 * checks the actual page content, not just the URL.
 */
async function pageState(win: BrowserWindow): Promise<'signedIn' | 'loginForm' | 'marketing' | 'rendering' | 'unknown'> {
  const url = win.webContents.getURL()
  if (/login\.microsoftonline\.com|login\.live\.com/i.test(url)) return 'loginForm'
  const isApp = /office\.com|cloud\.microsoft|onenote\.com|sharepoint\.com|office365\.com/i.test(url)
  if (!isApp) return 'unknown'
  const text: string = await win.webContents
    .executeJavaScript(`document.body ? document.body.innerText.slice(0, 600) : ''`, true)
    .catch(() => '')
  // The SPA shell loads before its content does — an (almost) empty body is
  // NOT "signed in", it's mid-render. Without this check we returned early on
  // an empty page and every scrape came back with 0 results.
  if (text.trim().length < 40) return 'rendering'
  if (/sign up for free|sign in to get started|see plans\s*&?\s*pricing|take notes anywhere for free/i.test(text)) return 'marketing'
  return 'signedIn'
}

/** Click a visible "Sign in" control on a marketing landing page. */
async function clickSignIn(win: BrowserWindow): Promise<boolean> {
  return win.webContents
    .executeJavaScript(
      `(function(){
         var nodes = document.querySelectorAll('a, button, [role="button"]');
         for (var i = 0; i < nodes.length; i++) {
           var t = (nodes[i].innerText || '').trim().toLowerCase();
           if (t === 'sign in' || t === 'log in' || t === 'login') { nodes[i].click(); return true; }
         }
         return false;
       })()`,
      true
    )
    .catch(() => false)
}

interface SignedInWindow {
  win: BrowserWindow
  /** Returns the URL of the last window.open() the page tried and we blocked. */
  lastPopupUrl: () => string
}

/** Signs in (if needed) and leaves the window on `startUrl`. Caller destroys it.win. */
async function openSignedIn(startUrl: string, timeoutMs = 90000): Promise<SignedInWindow> {
  const { email, password } = creds()
  const { win, lastPopupUrl } = makeWindow()
  try {
    await win.loadURL(startUrl)
    const deadline = Date.now() + timeoutMs
    let clickedSignIn = false
    while (Date.now() < deadline) {
      const state = await pageState(win)
      if (state === 'signedIn') return { win, lastPopupUrl }
      if (state === 'loginForm') {
        await win.webContents.executeJavaScript(FILL_SCRIPT(email, password), true).catch(() => {})
        const err = await win.webContents
          .executeJavaScript(`(document.body?document.body.innerText:'').match(/AADSTS\\d+|didn.t work|incorrect/i)?RegExp.lastMatch:''`, true)
          .catch(() => '')
        if (err && /AADSTS50126|incorrect|didn/i.test(String(err))) {
          throw new Error('Microsoft rejected the email or password.')
        }
      } else if (state === 'marketing') {
        clickedSignIn = await clickSignIn(win)
      }
      // 'rendering' and 'unknown' just fall through to the wait below and retry.
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
  const { win } = await openSignedIn('https://www.office.com/')
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
  const { win } = await openSignedIn('https://m365.cloud.microsoft/')
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

// Chrome/nav text that shows up as clickable elements but isn't a notebook.
const NOTEBOOK_CHROME =
  /^(search|recent|all notebooks|notebooks|copilot notebooks|favourites|favorites|give feedback|create new notebook|show all notebooks|name|opened|owner|go to copilot notebooks|learn more|word|excel|powerpoint|onenote|see plans( & pricing)?|get office|download|onenote clipper|featured apps|onenote help|community forum|contact support|privacy|consumer health policy|terms of use|settings|help|sign in|sign out|close|dismiss)$/i

const MONTH = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'

/**
 * The sidebar notebook list is plain text inside React-rendered rows, not
 * <a href> links (there are only ~2 real anchors on the whole page) — so DOM
 * queries for links/roles found nothing. document.body.innerText, however,
 * renders exactly what's on screen in reading order, e.g.:
 *   "...Copilot Notebooks\nRecent\nAll Notebooks\nNotebooks\nRecent\n
 *    2026 Humanities Course 2 (Mainstream) 8HU23 Notebook\n
 *    2026 Mathematics Course 2 8MA22 Notebook\n...\nAll Notebooks\nGive Feedback..."
 * so we parse the block between the real "Notebooks" section header (not the
 * "Copilot Notebooks" one above it) and the next "All Notebooks"/"Give Feedback".
 */
function parseNotebookNamesFromText(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const names: string[] = []
  let collecting = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!collecting) {
      // The real section header is the standalone line "Notebooks" — not "Copilot Notebooks".
      if (line === 'Notebooks' && lines[i + 1] === 'Recent') {
        collecting = true
        i++ // skip the "Recent" line
      }
      continue
    }
    if (/^(all notebooks|give feedback|favou?rites)$/i.test(line)) break
    if (NOTEBOOK_CHROME.test(line)) continue
    names.push(line)
  }
  return names
}

/** Wait until the OneNote app shell has actually rendered the notebook list. */
async function waitForNotebookText(win: BrowserWindow, timeoutMs = 20000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let text = ''
  while (Date.now() < deadline) {
    text = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true).catch(() => '')
    if (parseNotebookNamesFromText(text).length) return text
    await sleep(1200)
  }
  return text
}

/**
 * Navigate to the real "My notebooks" table (reachable via the "All Notebooks"
 * link) rather than the /copilotnotebooks landing page — clicking a name on the
 * landing page opens a Copilot Notebooks promo panel, not the actual notebook.
 */
async function goToNotebooksTable(win: BrowserWindow): Promise<void> {
  await waitForNotebookText(win)
  await win.webContents
    .executeJavaScript(
      `(function(){
         var all = document.querySelectorAll('body *'), matches = [];
         for (var i = 0; i < all.length; i++) {
           var el = all[i], own = (el.textContent || '').trim();
           if (own === 'All Notebooks' && el.querySelectorAll('*').length === 0) matches.push(el);
         }
         // The section order is Copilot Notebooks first, then Notebooks — take the last match.
         if (matches.length) matches[matches.length - 1].click();
       })()`,
      true
    )
    .catch(() => {})
  // Wait for the /notebooks table route to render.
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (/\/notebooks\b/.test(win.webContents.getURL())) break
    await sleep(800)
  }
  await sleep(1500)
}

/** Scrape the OneNote notebook list from the real signed-in app at onenote.cloud.microsoft. */
export async function oneNoteNotebooks(): Promise<MsFile[]> {
  const { win } = await openSignedIn('https://onenote.cloud.microsoft/')
  try {
    await goToNotebooksTable(win)
    const text = await win.webContents.executeJavaScript('document.body.innerText', true).catch(() => '')
    const names = parseNotebookNamesFromText(text)
    return names.map((name) => ({ name, url: '', app: 'OneNote' }))
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export interface NotebookContent {
  notebook: string
  sections: string[]
  pages: string[]
  text: string
}

/**
 * Open a specific notebook (by name or direct URL, as returned by
 * oneNoteNotebooks) and read what's visible: section names, page titles, and
 * the text of whichever page is showing. OneNote Online's editor is a rich
 * canvas rather than plain text, so this is best-effort — it reads whatever
 * innerText is currently rendered, which is usually enough to answer
 * questions about the content.
 */
export async function readNotebook(nameOrUrl: string): Promise<NotebookContent> {
  const { win, lastPopupUrl } = await openSignedIn('https://onenote.cloud.microsoft/')
  try {
    if (/^https?:\/\//i.test(nameOrUrl)) {
      await win.loadURL(nameOrUrl).catch(() => {})
    } else {
      // Notebook rows only exist on the real "My notebooks" TABLE (reached via
      // "All Notebooks"), not the /copilotnotebooks landing page — clicking a
      // name there opens a Copilot promo panel instead of the notebook.
      await goToNotebooksTable(win)

      // Rows are Fluent UI DataGrid items (role="row", tabIndex=0), not <a>
      // elements — confirmed by walking the ancestor chain of a real click.
      // A bare .click() on the text leaf doesn't reach the grid's handler, so
      // we find the nearest interactive ancestor and dispatch a full
      // pointer+mouse event sequence on it, matching real user input.
      const clicked = await win.webContents.executeJavaScript(
        `(function(){
           var target = ${JSON.stringify(nameOrUrl.trim().toLowerCase())};
           var all = document.querySelectorAll('body *'), leaf = null;
           for (var i = 0; i < all.length; i++) {
             var el = all[i], own = (el.textContent || '').trim().toLowerCase();
             if (!own || own.length > 200) continue;
             if (own === target || own.indexOf(target) === 0) {
               if (!leaf || el.querySelectorAll('*').length < leaf.querySelectorAll('*').length) leaf = el;
             }
           }
           if (!leaf) return false;
           var node = leaf, chosen = leaf;
           for (var d = 0; d < 8 && node; d++) {
             if (node.getAttribute && (node.getAttribute('role') === 'row' || node.tabIndex >= 0)) { chosen = node; break; }
             node = node.parentElement;
           }
           function fire(type) { chosen.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 })); }
           fire('pointerdown'); fire('mousedown'); fire('pointerup'); fire('mouseup'); fire('click');
           return true;
         })()`,
        true
      )
      if (!clicked) throw new Error(`Could not find a notebook matching "${nameOrUrl}". Call ms_onenote_notebooks first for exact names.`)

      // The click calls window.open() to a SharePoint-hosted editor URL — we
      // intercept and deny the popup (see makeWindow) and navigate here instead.
      const deadline0 = Date.now() + 8000
      while (Date.now() < deadline0 && !lastPopupUrl()) await sleep(300)
      const popup = lastPopupUrl()
      if (!popup) throw new Error(`Clicked "${nameOrUrl}" but no notebook opened — it may need to be opened manually once in a browser first.`)
      await win.loadURL(popup).catch(() => {})
    }

    // The notebook canvas renders inside an <iframe> (the SharePoint Doc.aspx
    // page embeds the Office Online Server editor). document.body.innerText on
    // the outer webContents never sees iframe content, so we run the
    // extraction in EVERY frame (Electron's WebFrameMain can reach into them
    // directly) and keep whichever returns the most real text.
    const EXTRACT_SCRIPT = `(function(){
      function textsOf(sel){
        var out = [], seen = {};
        try {
          document.querySelectorAll(sel).forEach(function(el){
            var t = (el.innerText || '').trim().split('\\n')[0];
            if (t && t.length > 1 && t.length < 120 && !seen[t]) { seen[t] = 1; out.push(t); }
          });
        } catch(e) {}
        return out.slice(0, 40);
      }
      var sections = textsOf('[aria-label*="section" i] [role="option"], [data-automation-id*="section" i], [class*="SectionTab" i]');
      var pages = textsOf('[aria-label*="page" i] [role="option"], [data-automation-id*="page" i], [class*="PageListItem" i], [class*="PageTitle" i]');
      var editor = document.querySelector('[contenteditable="true"], .WACViewPanel, [class*="EditorContainer" i], [role="document"], [role="main"]');
      var text = editor ? (editor.innerText || '') : (document.body ? document.body.innerText : '');
      return { sections: sections, pages: pages, text: (text || '').slice(0, 8000) };
    })()`

    let sections: string[] = []
    let pages: string[] = []
    let text = ''
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      await sleep(1500)
      const frames = win.webContents.mainFrame.framesInSubtree
      for (const frame of frames) {
        // TokenFactoryIframe is an MSAL silent-auth helper whose "page" is raw
        // JS source rendered as text/plain — it out-scored real content because
        // it's large, so it's excluded explicitly rather than by size.
        if (/TokenFactoryIframe/i.test(frame.url)) continue
        const r = await frame.executeJavaScript(EXTRACT_SCRIPT, true).catch(() => null)
        if (r && (r.text || '').length > text.length) {
          sections = r.sections || []
          pages = r.pages || []
          text = r.text || ''
        }
      }
      if (text.trim().length > 200 || (sections.length && pages.length)) break
    }

    const notebook = await win.webContents
      .executeJavaScript(`document.title.replace(/\\s*[-|].*$/, '').trim()`, true)
      .catch(() => nameOrUrl)

    return { notebook: String(notebook || nameOrUrl), sections, pages, text: text.trim() }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export function isConnected(): boolean {
  return !!getSettings().microsoft.account
}

/** Diagnostics only — exposes the internal sign-in flow for debugging. */

import { existsSync } from 'fs'

/**
 * Fallback SEQTA login when the pure-HTTP SSO helper fails. Drives a real
 * (headless) Chromium/Edge via puppeteer-core through the Microsoft SSO web
 * flow, then reads the JSESSIONID cookie and the student's identity.
 *
 * Uses the system browser (no bundled Chromium download). puppeteer-core is
 * imported lazily so the app still runs if it isn't installed.
 */

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
]

function findBrowser(): string {
  const env = process.env.SCHOOLMOD_BROWSER || process.env.CHROME_PATH
  if (env && existsSync(env)) return env
  for (const c of CANDIDATES) if (existsSync(c)) return c
  throw new Error('No Chrome/Edge found for the Puppeteer fallback. Install Chrome or set CHROME_PATH.')
}

export async function puppeteerLogin(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ ok: boolean; jsessionid: string; personUUID: string; id: number; name: string; code: string }> {
  let puppeteer: any
  try {
    puppeteer = await import('puppeteer-core')
  } catch {
    throw new Error('puppeteer-core is not installed.')
  }

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  })
  try {
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    )
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 60000 })

    // Microsoft email step
    await page.waitForSelector('input[type=email], #i0116', { timeout: 30000 }).catch(() => {})
    if (await page.$('input[type=email], #i0116')) {
      await page.type('input[type=email], #i0116', email, { delay: 20 })
      await clickNext(page)
      await page.waitForSelector('input[type=password], #i0118', { timeout: 30000 })
      await page.type('input[type=password], #i0118', password, { delay: 20 })
      await clickNext(page)
      // "Stay signed in?" prompt
      await page.waitForSelector('#idSIButton9, input[type=submit]', { timeout: 15000 }).catch(() => {})
      await clickNext(page)
    }

    // Wait until we're back on the SEQTA origin.
    await page
      .waitForFunction((b: string) => location.href.startsWith(b), { timeout: 60000 }, baseUrl)
      .catch(() => {})
    await page.waitForNetworkIdle({ timeout: 20000 }).catch(() => {})

    const cookies = await page.cookies(baseUrl)
    const jsessionid = cookies.find((c: any) => c.name === 'JSESSIONID')?.value
    if (!jsessionid) throw new Error('Login completed but no JSESSIONID cookie was found.')

    // Fetch identity from within the page (already authenticated).
    const info = await page.evaluate(async (b: string) => {
      const r = await fetch(`${b}/seqta/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ mode: 'normal', query: null, redirect_url: `${b}/` })
      })
      const p = (await r.json())?.payload || {}
      return { personUUID: p.personUUID, id: p.id, name: p.userDesc || '', code: p.meta?.code || '' }
    }, baseUrl)

    return { ok: true, jsessionid, ...info }
  } finally {
    await browser.close().catch(() => {})
  }
}

async function clickNext(page: any) {
  const btn = await page.$('#idSIButton9, input[type=submit], button[type=submit]')
  if (btn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      btn.click()
    ])
  }
}

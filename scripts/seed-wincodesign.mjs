// Works around electron-builder's winCodeSign extraction failing on Windows
// without Developer Mode ("Cannot create symbolic link"). The archive contains
// macOS dylib symlinks we don't need for a Windows build, so we pre-extract it
// into electron-builder's cache under the stable name, skipping the darwin dir.
//
// Run once before `npm run build:win` on a Windows machine without Dev Mode.
import { existsSync, mkdirSync, readdirSync, createWriteStream } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFileSync } from 'child_process'
import https from 'https'

const VERSION = 'winCodeSign-2.6.0'
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`
const cacheDir = join(homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
const dest = join(cacheDir, VERSION)
const sevenZip = join(process.cwd(), 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

if (process.platform !== 'win32') {
  console.log('Not Windows — nothing to do.')
  process.exit(0)
}

function findArchive() {
  if (!existsSync(cacheDir)) return null
  const f = readdirSync(cacheDir).find((n) => n.endsWith('.7z'))
  return f ? join(cacheDir, f) : null
}

function download(url, out) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.headers.location) return go(res.headers.location)
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        const file = createWriteStream(out)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve(out)))
      }).on('error', reject)
    }
    go(url)
  })
}

async function main() {
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    console.log('✓ winCodeSign already seeded at', dest)
    return
  }
  mkdirSync(cacheDir, { recursive: true })
  let archive = findArchive()
  if (!archive) {
    archive = join(cacheDir, `${VERSION}.7z`)
    console.log('Downloading', URL)
    await download(URL, archive)
  }
  mkdirSync(dest, { recursive: true })
  console.log('Extracting (excluding macOS symlinks)…')
  execFileSync(sevenZip, ['x', '-y', archive, `-o${dest}`, '-xr!darwin', '-xr!*.dylib'], {
    stdio: 'inherit'
  })
  console.log('✓ Seeded winCodeSign — you can now run npm run build:win')
}

main().catch((e) => {
  console.error('Failed to seed winCodeSign:', e.message)
  process.exit(1)
})

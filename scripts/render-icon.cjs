// Renders build/icon.svg (the SchoolMod logo) to the PNG icons the app ships:
//   build/icon.png      1024×1024  (electron-builder makes the .exe/.ico/.icns from it)
//   resources/icon.png   512×512   (window, taskbar and tray icon at runtime)
// The logo is taller than wide, so it's centred on a transparent square.
//
// Run with Electron (it's the SVG renderer):  npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')
const targets = [
  [path.join(root, 'build', 'icon.png'), 1024],
  [path.join(root, 'resources', 'icon.png'), 512]
]

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  // Render once at the largest size; smaller icons are scaled down from it.
  const size = targets[0][1]
  {
    const win = new BrowserWindow({
      width: size,
      height: size,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      useContentSize: true,
      webPreferences: { offscreen: true }
    })
    const pad = Math.round(size * 0.04)
    const html = `<!doctype html><html style="overflow:hidden;background:transparent"><body style="margin:0;overflow:hidden;width:${size}px;height:${size}px;background:transparent;display:grid;place-items:center">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${size - 2 * pad}px;height:${size - 2 * pad}px;object-fit:contain"></body></html>`
    const tmp = path.join(require('os').tmpdir(), 'schoolmod-icon-' + size + '.html')
    fs.writeFileSync(tmp, html)
    await win.loadFile(tmp)
    fs.unlinkSync(tmp)
    await new Promise((r) => setTimeout(r, 400))
    const img = (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).resize({ width: size, height: size })
    for (const [out, px] of targets) {
      fs.writeFileSync(out, (px === size ? img : img.resize({ width: px, height: px, quality: 'best' })).toPNG())
      console.log('wrote', path.relative(root, out), px + 'x' + px)
    }
    win.destroy()
  }
  app.quit()
})

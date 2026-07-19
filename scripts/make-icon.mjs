// Dependency-free icon generator → build/icon.png (512×512, 2× supersampled).
// Draws a rounded-square gradient badge with a white notebook + bookmark mark.
import zlib from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

const S = 512
const SS = 2 // supersample
const W = S * SS

function lerp(a, b, t) {
  return a + (b - a) * t
}
function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}
const C1 = hex('#5b86ff')
const C2 = hex('#1a36c9')
const ACCENT = hex('#2a4be0')

function roundedInside(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

// hi-res RGBA
const hi = new Uint8ClampedArray(W * W * 4)
for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const px = x / SS
    const py = y / SS
    let r = 0,
      g = 0,
      b = 0,
      a = 0
    // background rounded square
    if (roundedInside(px, py, 6, 6, S - 6, S - 6, 112)) {
      const t = (px + py) / (2 * S)
      r = lerp(C1[0], C2[0], t)
      g = lerp(C1[1], C2[1], t)
      b = lerp(C1[2], C2[2], t)
      a = 255
    }
    // notebook body (white)
    if (roundedInside(px, py, 150, 120, 366, 396, 26)) {
      r = 255
      g = 255
      b = 255
      a = 255
    }
    // spine
    if (roundedInside(px, py, 150, 120, 190, 396, 26) && px < 186) {
      r = ACCENT[0]
      g = ACCENT[1]
      b = ACCENT[2]
      a = 255
    }
    // text lines
    const lines = [190, 240, 290]
    for (const ly of lines) {
      if (roundedInside(px, py, 214, ly, 340, ly + 16, 8)) {
        r = ACCENT[0]
        g = ACCENT[1]
        b = ACCENT[2]
        a = 255
      }
    }
    // bookmark ribbon (accent) near top-right with notch
    if (px >= 300 && px <= 340 && py >= 108 && py <= 190) {
      const notch = py > 168 ? Math.abs(px - 320) > 20 - (py - 168) : true
      if (notch) {
        r = C2[0]
        g = C2[1]
        b = C2[2]
        a = 255
      }
    }
    const i = (y * W + x) * 4
    hi[i] = r
    hi[i + 1] = g
    hi[i + 2] = b
    hi[i + 3] = a
  }
}

// downsample 2× → 512
const out = Buffer.alloc(S * S * 4)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0,
      g = 0,
      b = 0,
      a = 0
    for (let dy = 0; dy < SS; dy++)
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * W + (x * SS + dx)) * 4
        r += hi[i]
        g += hi[i + 1]
        b += hi[i + 2]
        a += hi[i + 3]
      }
    const n = SS * SS
    const o = (y * S + x) * 4
    out[o] = r / n
    out[o + 1] = g / n
    out[o + 2] = b / n
    out[o + 3] = a / n
  }
}

// encode PNG
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
// scanlines with filter byte 0
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  out.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
}
const idat = zlib.deflateSync(raw, { level: 9 })
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png)
console.log('Wrote build/icon.png', png.length, 'bytes')

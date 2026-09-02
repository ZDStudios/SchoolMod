import { readFileSync } from 'fs'
import { extname, basename } from 'path'
import { NotebookChunk } from '../../shared/types'

/** Extract plain text from a file. Supports txt/md/csv/json natively, and
 *  pdf/docx via lazily-imported parsers so a failure there never breaks the app. */
export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  if (['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.rtf'].includes(ext)) {
    return readFileSync(filePath, 'utf-8')
  }
  if (ext === '.pdf') {
    try {
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const data = new Uint8Array(readFileSync(filePath))
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true })
        .promise
      let out = ''
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        out += content.items.map((it: any) => it.str).join(' ') + '\n\n'
      }
      return out
    } catch (e: any) {
      throw new Error(`Could not read PDF "${basename(filePath)}": ${e?.message || e}`)
    }
  }
  if (ext === '.docx') {
    try {
      const mammoth: any = await import('mammoth')
      const { value } = await mammoth.extractRawText({ path: filePath })
      return value
    } catch (e: any) {
      throw new Error(`Could not read DOCX "${basename(filePath)}": ${e?.message || e}`)
    }
  }
  // Fallback: try utf-8
  return readFileSync(filePath, 'utf-8')
}

/** Split text into overlapping chunks of roughly `size` characters. */
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  const paras = clean.split(/\n\n+/)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > size && buf) {
      chunks.push(buf.trim())
      buf = buf.slice(Math.max(0, buf.length - overlap))
    }
    buf += (buf ? '\n\n' : '') + p
    // hard-split very long paragraphs
    while (buf.length > size * 1.6) {
      chunks.push(buf.slice(0, size).trim())
      buf = buf.slice(size - overlap)
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}

const STOP = new Set(
  'a an and are as at be by for from has have in is it its of on or that the to was were will with this these those you your i we they he she'.split(
    ' '
  )
)
function tokenize(s: string): string[] {
  return ((s.toLowerCase().match(/[a-z0-9]+/g) || []) as string[]).filter((t) => t.length > 1 && !STOP.has(t))
}

/** BM25 ranking over a notebook's chunks. Returns the top-k chunks with scores. */
export function bm25(
  query: string,
  chunks: NotebookChunk[],
  k = 5
): { chunk: NotebookChunk; score: number }[] {
  if (!chunks.length) return []
  const docs = chunks.map((c) => tokenize(c.text))
  const N = docs.length
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N || 1
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1)
  const qTokens = tokenize(query)
  const k1 = 1.5
  const b = 0.75
  const scored = docs.map((d, i) => {
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1)
    let score = 0
    for (const q of qTokens) {
      const f = tf.get(q)
      if (!f) continue
      const n = df.get(q) || 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgdl)))
    }
    return { chunk: chunks[i], score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

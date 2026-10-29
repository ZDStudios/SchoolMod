import { randomUUID } from 'crypto'
import { getNotebooks, saveNotebooks } from '../store'
import { complete } from './claude'
import { extractText, chunkText, bm25 } from './rag'
import { Notebook, NotebookChunk, RagAnswer, ChatMessage } from '../../shared/types'

const EMOJIS = ['📓', '📗', '📘', '📙', '🧠', '🔬', '📐', '🧪', '🗺️', '⚗️', '🎼', '💡']

function all(): Notebook[] {
  return getNotebooks()
}
function persist(nbs: Notebook[]) {
  saveNotebooks(nbs)
}
function find(id: string): Notebook {
  const nb = all().find((n) => n.id === id)
  if (!nb) throw new Error('Notebook not found')
  return nb
}
function replace(nb: Notebook) {
  nb.updatedAt = Date.now()
  persist(all().map((n) => (n.id === nb.id ? nb : n)))
}

export function list(): Notebook[] {
  return all()
}

export function create(title: string): Notebook {
  const nb: Notebook = {
    id: randomUUID(),
    title: title || 'Untitled notebook',
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sources: [],
    chunks: [],
    summary: '',
    chat: []
  }
  persist([nb, ...all()])
  return nb
}

export function remove(id: string) {
  persist(all().filter((n) => n.id !== id))
}

function ingest(nb: Notebook, name: string, type: string, text: string) {
  const sourceId = randomUUID()
  const parts = chunkText(text)
  const chunks: NotebookChunk[] = parts.map((t, i) => ({
    id: randomUUID(),
    sourceId,
    sourceName: name,
    index: i,
    text: t
  }))
  nb.sources.push({ id: sourceId, name, type, addedAt: Date.now(), charCount: text.length })
  nb.chunks.push(...chunks)
}

export function addSourceText(id: string, name: string, text: string): Notebook {
  const nb = find(id)
  ingest(nb, name || 'Pasted text', 'text', text)
  replace(nb)
  return nb
}

export async function addSourceFiles(id: string, filePaths: string[]): Promise<Notebook> {
  const nb = find(id)
  for (const fp of filePaths) {
    const text = await extractText(fp)
    const name = fp.split(/[\\/]/).pop() || 'file'
    if (text.trim()) ingest(nb, name, name.split('.').pop() || 'file', text)
  }
  replace(nb)
  return nb
}

export function removeSource(id: string, sourceId: string): Notebook {
  const nb = find(id)
  nb.sources = nb.sources.filter((s) => s.id !== sourceId)
  nb.chunks = nb.chunks.filter((c) => c.sourceId !== sourceId)
  replace(nb)
  return nb
}

export async function ask(id: string, question: string): Promise<RagAnswer> {
  const nb = find(id)
  if (!nb.chunks.length) {
    return { answer: 'This notebook has no sources yet. Add some notes or documents first.', citations: [] }
  }
  const top = bm25(question, nb.chunks, 6)
  const context = top
    .map((t, i) => `[${i + 1}] (from "${t.chunk.sourceName}")\n${t.chunk.text}`)
    .join('\n\n---\n\n')

  const system =
    'You are a precise study assistant. Answer the question using ONLY the numbered sources provided. ' +
    'Cite the sources you use inline with bracketed numbers like [1] or [2]. If the sources do not contain ' +
    'the answer, say so honestly. Be clear and concise, and format with markdown when helpful.'
  const user = `SOURCES:\n${context}\n\nQUESTION: ${question}`
  const answer = await complete(system, user)

  const citations = top.map((t, i) => ({
    sourceName: t.chunk.sourceName,
    sourceId: t.chunk.sourceId,
    chunkIndex: i + 1,
    snippet: t.chunk.text.slice(0, 240) + (t.chunk.text.length > 240 ? '…' : '')
  }))
  return { answer, citations }
}

export function saveChat(id: string, chat: ChatMessage[]): Notebook {
  const nb = find(id)
  nb.chat = chat
  replace(nb)
  return nb
}

function corpusSample(nb: Notebook, max = 12000): string {
  let out = ''
  for (const c of nb.chunks) {
    if (out.length + c.text.length > max) break
    out += c.text + '\n\n'
  }
  return out
}

export async function summarise(id: string): Promise<Notebook> {
  const nb = find(id)
  if (!nb.chunks.length) throw new Error('Add sources before summarising.')
  const summary = await complete(
    'You summarise study material into a tight, well-structured markdown briefing.',
    `Summarise the key ideas from the following material. Use a short overview paragraph, then 4-8 bullet ` +
      `points of the most important facts, then a "Key terms" list.\n\n${corpusSample(nb)}`
  )
  nb.summary = summary
  replace(nb)
  return nb
}

export async function studyGuide(id: string): Promise<string> {
  const nb = find(id)
  if (!nb.chunks.length) throw new Error('Add sources before generating a study guide.')
  return complete(
    'You are an expert teacher creating a revision study guide.',
    `Create a comprehensive markdown study guide from this material. Include: learning objectives, a concept ` +
      `breakdown with clear explanations, worked examples where relevant, and 6 self-test questions with answers ` +
      `at the end.\n\n${corpusSample(nb)}`
  )
}

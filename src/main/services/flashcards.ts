import { randomUUID } from 'crypto'
import { getDecks, saveDecks } from '../store'
import { complete } from './claude'
import { Deck, Flashcard, ReviewGrade } from '../../shared/types'

const DAY = 24 * 60 * 60 * 1000
const EMOJIS = ['🃏', '⚡', '🎯', '🧩', '🔥', '🌟', '🧠', '📚']

function all(): Deck[] {
  return getDecks()
}
function persist(decks: Deck[]) {
  saveDecks(decks)
}
function find(id: string): Deck {
  const d = all().find((x) => x.id === id)
  if (!d) throw new Error('Deck not found')
  return d
}
function replace(deck: Deck) {
  persist(all().map((d) => (d.id === deck.id ? deck : d)))
}

export function list(): Deck[] {
  return all()
}

export function create(title: string, description = ''): Deck {
  const deck: Deck = {
    id: randomUUID(),
    title: title || 'New deck',
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    description,
    createdAt: Date.now(),
    cards: []
  }
  persist([deck, ...all()])
  return deck
}

export function remove(id: string) {
  persist(all().filter((d) => d.id !== id))
}

function newCard(front: string, back: string, hint?: string): Flashcard {
  return {
    id: randomUUID(),
    front,
    back,
    hint,
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    due: Date.now(),
    lapses: 0
  }
}

export function addCard(deckId: string, front: string, back: string, hint?: string): Deck {
  const deck = find(deckId)
  deck.cards.push(newCard(front, back, hint))
  replace(deck)
  return deck
}

/** SM-2 spaced repetition update. grade 0-5 (0=blackout, 5=perfect). */
export function review(deckId: string, cardId: string, grade: ReviewGrade): Deck {
  const deck = find(deckId)
  const card = deck.cards.find((c) => c.id === cardId)
  if (!card) throw new Error('Card not found')

  if (grade < 3) {
    card.repetitions = 0
    card.interval = 1
    card.lapses += 1
  } else {
    if (card.repetitions === 0) card.interval = 1
    else if (card.repetitions === 1) card.interval = 6
    else card.interval = Math.round(card.interval * card.ease)
    card.repetitions += 1
  }
  card.ease = Math.max(1.3, card.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))
  card.due = Date.now() + card.interval * DAY
  replace(deck)
  return deck
}

/** Cards that are due now, plus new (never-reviewed) cards. */
export function dueCards(deck: Deck): Flashcard[] {
  const now = Date.now()
  return deck.cards.filter((c) => c.due <= now || c.repetitions === 0)
}

function parseCards(raw: string): { front: string; back: string; hint?: string }[] {
  let s = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1)
  try {
    const arr = JSON.parse(s)
    return arr
      .filter((c: any) => c && (c.front || c.question) && (c.back || c.answer))
      .map((c: any) => ({
        front: String(c.front || c.question).trim(),
        back: String(c.back || c.answer).trim(),
        hint: c.hint ? String(c.hint).trim() : undefined
      }))
  } catch {
    return []
  }
}

export async function generate(deckId: string, topicOrNotes: string, count = 12): Promise<Deck> {
  const deck = find(deckId)
  const raw = await complete(
    'You are a flashcard generator like Gizmo. You output ONLY a JSON array, no prose. Each element is ' +
      '{"front": "...", "back": "...", "hint": "..."}. Fronts are focused questions or prompts; backs are ' +
      'concise, correct answers. Hints are optional short nudges.',
    `Create ${count} high-quality study flashcards from the following topic or notes. Vary question types ` +
      `(definitions, application, compare/contrast). Return ONLY the JSON array.\n\n${topicOrNotes}`
  )
  const cards = parseCards(raw)
  if (!cards.length) throw new Error('Could not generate cards — check your Claude connection in Settings.')
  for (const c of cards) deck.cards.push(newCard(c.front, c.back, c.hint))
  replace(deck)
  return deck
}

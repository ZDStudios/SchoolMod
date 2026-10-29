import { dialog, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import {
  getSettings,
  setSettings,
  getNotebooks,
  saveNotebooks,
  getDecks,
  saveDecks
} from '../store'

/**
 * Export/import everything the app stores, so a student can move to a new
 * machine or keep a safety copy of their notes and decks.
 *
 * Credentials are deliberately NOT included — a backup file is something
 * people email themselves or drop in cloud storage, and it should never be a
 * way to leak a school password. Preferences, notebooks and decks all survive;
 * the accounts just need reconnecting once.
 */

const FORMAT = 'schoolmod-backup'
const VERSION = 1

export async function exportAll(win: BrowserWindow | null) {
  const s = getSettings()
  const payload = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      theme: s.theme,
      accent: s.accent,
      notifications: s.notifications,
      desktop: s.desktop,
      computerAccess: s.computerAccess,
      claude: { mode: s.claude.mode, model: s.claude.model },
      // Deliberately omitted: seqta credentials/session, microsoft account.
      seqta: { mode: s.seqta.mode, baseUrl: s.seqta.baseUrl }
    },
    notebooks: getNotebooks(),
    decks: getDecks()
  }

  const res = await dialog.showSaveDialog(win!, {
    title: 'Export SchoolMod backup',
    defaultPath: `schoolmod-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'SchoolMod backup', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePath) return { saved: false }
  writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8')
  return {
    saved: true,
    path: res.filePath,
    notebooks: payload.notebooks.length,
    decks: payload.decks.length
  }
}

export async function importAll(win: BrowserWindow | null) {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Restore SchoolMod backup',
    properties: ['openFile'],
    filters: [{ name: 'SchoolMod backup', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePaths.length) return { imported: false }

  const raw = readFileSync(res.filePaths[0], 'utf-8').replace(/^﻿/, '')
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (data?.format !== FORMAT) throw new Error('That does not look like a SchoolMod backup file.')

  // Merge rather than replace, so restoring never destroys work that only
  // exists on this machine. Same id = incoming wins.
  const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
    const map = new Map(existing.map((x) => [x.id, x]))
    for (const item of incoming || []) map.set(item.id, item)
    return [...map.values()]
  }

  const notebooks = mergeById(getNotebooks(), data.notebooks || [])
  const decks = mergeById(getDecks(), data.decks || [])
  saveNotebooks(notebooks)
  saveDecks(decks)

  if (data.settings) {
    const cur = getSettings()
    setSettings({
      theme: data.settings.theme ?? cur.theme,
      accent: data.settings.accent ?? cur.accent,
      notifications: { ...cur.notifications, ...data.settings.notifications },
      desktop: { ...cur.desktop, ...data.settings.desktop },
      computerAccess: data.settings.computerAccess ?? cur.computerAccess,
      claude: { ...cur.claude, ...data.settings.claude }
    })
  }

  return { imported: true, notebooks: notebooks.length, decks: decks.length }
}

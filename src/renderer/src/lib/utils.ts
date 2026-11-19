import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { IpcResult } from '../../../shared/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Unwrap the {ok,data,error} envelope, throwing on failure. */
export async function call<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || 'Something went wrong')
  return res.data as T
}

/**
 * Never render a raw email address as someone's name. SEQTA SSO returns the
 * real name (userDesc), but direct-login falls back to the username, which is
 * an email at SSO schools — so sanitise at the display layer.
 */
export function friendlyName(name?: string, fallback = 'there'): string {
  const n = (name || '').trim()
  if (!n || n.includes('@')) return fallback
  return n
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function daysUntil(iso: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

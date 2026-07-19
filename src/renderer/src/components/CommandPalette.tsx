import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  LayoutDashboard,
  Sparkles,
  BookOpen,
  Layers,
  CalendarDays,
  BarChart3,
  CalendarRange,
  Grid2x2,
  Calculator,
  GraduationCap,
  Settings as SettingsIcon,
  Users,
  Mail,
  Moon
} from 'lucide-react'
import { useApp } from '../store/app'

interface Cmd {
  id: string
  label: string
  group: string
  icon: any
  run: () => void
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const commands: Cmd[] = useMemo(() => {
    const go = (to: string) => () => { nav(to); setOpen(false) }
    const app = (k: string) => () => { window.api.microsoft.openApp(k); setOpen(false) }
    return [
      { id: 'dash', label: 'Dashboard', group: 'Go to', icon: LayoutDashboard, run: go('/') },
      { id: 'assistant', label: 'AI Assistant', group: 'Go to', icon: Sparkles, run: go('/assistant') },
      { id: 'notebooks', label: 'Notebooks', group: 'Go to', icon: BookOpen, run: go('/notebooks') },
      { id: 'flashcards', label: 'Flashcards', group: 'Go to', icon: Layers, run: go('/flashcards') },
      { id: 'seqta', label: 'SEQTA', group: 'Go to', icon: CalendarDays, run: go('/seqta') },
      { id: 'grades', label: 'Grades & averages', group: 'Go to', icon: BarChart3, run: go('/grades') },
      { id: 'planner', label: 'AI Study Planner', group: 'Go to', icon: CalendarRange, run: go('/planner') },
      { id: 'ms', label: 'Microsoft 365', group: 'Go to', icon: Grid2x2, run: go('/microsoft') },
      { id: 'maths', label: 'Mathspace', group: 'Go to', icon: Calculator, run: go('/mathspace') },
      { id: 'ep', label: 'Education Perfect', group: 'Go to', icon: GraduationCap, run: go('/educationperfect') },
      { id: 'settings', label: 'Settings', group: 'Go to', icon: SettingsIcon, run: go('/settings') },
      { id: 'nb-new', label: 'New notebook', group: 'Actions', icon: BookOpen, run: go('/notebooks') },
      { id: 'deck-new', label: 'New flashcard deck', group: 'Actions', icon: Layers, run: go('/flashcards') },
      { id: 'teams', label: 'Open Teams', group: 'Actions', icon: Users, run: app('teams') },
      { id: 'outlook', label: 'Open Outlook', group: 'Actions', icon: Mail, run: app('outlook') },
      {
        id: 'theme',
        label: 'Toggle dark / light',
        group: 'Actions',
        icon: Moon,
        run: () => {
          const s = useApp.getState().settings
          const isDark = document.documentElement.classList.contains('dark')
          useApp.getState().save({ theme: isDark ? 'light' : 'dark' })
          setOpen(false)
        }
      }
    ]
  }, [nav])

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
  const groups = [...new Set(filtered.map((c) => c.group))]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="card w-[560px] max-w-[92vw] overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Search size={17} style={{ color: 'var(--text-dim)' }} />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Search pages and actions…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run() }
            }}
          />
          <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--bg)', color: 'var(--text-dim)' }}>ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <p className="py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>No matches.</p>}
          {groups.map((g) => (
            <div key={g}>
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>{g}</p>
              {filtered.filter((c) => c.group === g).map((c) => {
                const idx = filtered.indexOf(c)
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={c.run}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm"
                    style={{ background: idx === sel ? 'var(--accent-soft)' : 'transparent', color: idx === sel ? 'var(--accent)' : 'var(--text)' }}
                  >
                    <c.icon size={16} /> {c.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  BookOpen,
  Layers,
  Grid2x2,
  Calculator,
  GraduationCap,
  BarChart3,
  CalendarRange,
  Settings as SettingsIcon
} from 'lucide-react'
import { useApp } from '../store/app'
import { friendlyName } from '../lib/utils'

const studyNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/notebooks', label: 'Notebooks', icon: BookOpen },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
  { to: '/planner', label: 'Study Planner', icon: CalendarRange }
]
const connectNav = [
  { to: '/seqta', label: 'SEQTA', icon: CalendarDays },
  { to: '/grades', label: 'Grades', icon: BarChart3 },
  { to: '/microsoft', label: 'Microsoft 365', icon: Grid2x2 },
  { to: '/mathspace', label: 'Mathspace', icon: Calculator },
  { to: '/educationperfect', label: 'Education Perfect', icon: GraduationCap }
]

export default function Sidebar() {
  const settings = useApp((s) => s.settings)
  const connected = settings?.seqta.connected
  const ssoMode = settings?.seqta.mode === 'sso'
  const name = friendlyName(settings?.seqta.displayName, 'Student')
  const [photo, setPhoto] = useState('')

  useEffect(() => {
    if (connected && ssoMode) {
      window.api.seqta.photo().then((r) => r.ok && r.data && setPhoto(r.data)).catch(() => {})
    } else {
      setPhoto('')
    }
  }, [connected, ssoMode])

  return (
    <aside
      className="flex w-[236px] shrink-0 flex-col border-r"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-sidebar)' }}
    >
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
          Study
        </p>
        {studyNav.map((n) => (
          <Item key={n.to} {...n} />
        ))}
        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
          Connect
        </p>
        {connectNav.map((n) => (
          <Item key={n.to} {...n} />
        ))}
      </nav>

      <div className="p-3">
        <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <SettingsIcon size={18} />
          Settings
        </NavLink>
        <div
          className="mt-2 flex items-center gap-3 rounded-xl p-2.5"
          style={{ background: 'var(--bg)' }}
        >
          {photo ? (
            <img src={photo} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--text-dim)' }}>
              {connected ? 'SEQTA connected' : 'SchoolMod student'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Item({ to, label, icon: Icon, end }: { to: string; label: string; icon: any; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
      <Icon size={18} />
      {label}
    </NavLink>
  )
}

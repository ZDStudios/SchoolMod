import { ReactNode, useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Electron does not implement window.prompt() — it throws, which silently broke
 * "New notebook" and "New deck". This is the in-app replacement.
 */
export function PromptModal({
  title,
  label,
  defaultValue = '',
  confirmText = 'Create',
  onSubmit,
  onClose
}: {
  title: string
  label?: string
  defaultValue?: string
  confirmText?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => {
      ref.current?.focus()
      ref.current?.select()
    }, 30)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSubmit(v)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-[420px] max-w-[90vw] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">{title}</h3>
        {label && (
          <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
            {label}
          </span>
        )}
        <input
          ref={ref}
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!value.trim()}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className="grid h-11 w-11 place-items-center rounded-2xl text-white"
            style={{ background: 'var(--accent)' }}
          >
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({
  icon,
  title,
  hint,
  action
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center"
      style={{ borderColor: 'var(--border)' }}>
      <div className="mb-3 opacity-60" style={{ color: 'var(--text-dim)' }}>
        {icon}
      </div>
      <p className="text-base font-semibold">{title}</p>
      {hint && (
        <p className="mt-1 max-w-sm text-sm" style={{ color: 'var(--text-dim)' }}>
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-500">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'default'
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'accent'
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
          {label}
        </span>
        {icon && <span style={{ color: tone === 'accent' ? 'var(--accent)' : 'var(--text-dim)' }}>{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  )
}

/**
 * Shown in place of any AI-powered feature while the master switch is off.
 * A single component so every disabled surface says the same thing and points
 * at the same setting.
 */
export function AiDisabled({ feature = 'This feature' }: { feature?: string }) {
  return (
    <div className="card mx-auto my-10 max-w-md p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: 'var(--bg)' }}>
        <Sparkles size={22} style={{ color: 'var(--text-dim)' }} />
      </div>
      <h2 className="font-semibold">AI features are off</h2>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--text-dim)' }}>
        {feature} needs the AI assistant. Everything else — SEQTA, timetable, grades, reports, notebooks and
        flashcards — keeps working without it.
      </p>
      <Link to="/settings" className="btn btn-primary mt-4">
        Open Settings
      </Link>
    </div>
  )
}

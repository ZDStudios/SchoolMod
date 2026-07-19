import { ReactNode } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

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

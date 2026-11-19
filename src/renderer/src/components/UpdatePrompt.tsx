import { useEffect } from 'react'
import { Download, ExternalLink, Loader2, Sparkles, X } from 'lucide-react'
import { useApp } from '../store/app'
import { useUpdate } from '../store/update'

const SIX_HOURS = 6 * 60 * 60 * 1000

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

/**
 * "A new version of SchoolMod is available" prompt. Also owns the automatic
 * check: shortly after launch, then every six hours while the app is open.
 */
export default function UpdatePrompt() {
  const autoCheck = useApp((s) => s.settings?.updates?.autoCheck ?? true)
  const loaded = useApp((s) => s.loaded)
  const { info, promptOpen, installing, progress, error, install, later, skip } = useUpdate()

  useEffect(() => {
    if (!loaded || !autoCheck) return
    const run = () => useUpdate.getState().check(true)
    const first = setTimeout(run, 5000) // let the dashboard load first
    const every = setInterval(run, SIX_HOURS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [loaded, autoCheck])

  useEffect(() => {
    if (!promptOpen || installing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && later()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [promptOpen, installing])

  if (!promptOpen || !info?.available) return null

  const pct = Math.round(progress * 100)
  const action =
    info.kind === 'portable'
      ? 'SchoolMod will download the new portable version, close, and reopen as the new version.'
      : info.kind === 'installer'
        ? 'SchoolMod will download the update, close, install it and reopen.'
        : 'This opens the download page for the new version.'

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/40 backdrop-blur-sm" onClick={() => !installing && later()}>
      <div className="card w-[520px] max-w-[92vw] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Sparkles size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Hey, there's a new update!</h3>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              SchoolMod <strong style={{ color: 'var(--text)' }}>{info.latest}</strong> is out — you have {info.current}. Would you like
              to update?
            </p>
          </div>
          {!installing && (
            <button className="btn btn-ghost -mr-2 -mt-1 px-2 py-1" onClick={later} aria-label="Close">
              <X size={15} />
            </button>
          )}
        </div>

        {info.notes && (
          <div
            className="mb-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border px-3.5 py-2.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
          >
            {info.notes}
          </div>
        )}

        <p className="mb-4 text-xs" style={{ color: 'var(--text-dim)' }}>
          {action}
          {info.downloadSize > 0 && ` (${mb(info.downloadSize)})`}
        </p>

        {installing && (
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
            </div>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
              {pct < 100 ? `Downloading… ${pct}%` : 'Restarting into the new version…'}
            </p>
          </div>
        )}
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost whitespace-nowrap px-2 text-xs" onClick={skip} disabled={installing}>
            Skip this version
          </button>
          <button
            className="btn btn-ghost whitespace-nowrap px-2 text-xs"
            onClick={() => window.api.openExternal(info.pageUrl)}
            disabled={installing}
          >
            <ExternalLink size={13} /> Release notes
          </button>
          <div className="flex-1" />
          <button className="btn whitespace-nowrap" onClick={later} disabled={installing}>
            Later
          </button>
          <button className="btn btn-primary whitespace-nowrap" onClick={install} disabled={installing}>
            {installing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {installing ? 'Updating…' : 'Update now'}
          </button>
        </div>
      </div>
    </div>
  )
}

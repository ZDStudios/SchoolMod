import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

const isMac = navigator.userAgent.includes('Macintosh')

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.win.isMaximized().then((r) => r.ok && setMaximized(!!r.data))
  }, [])

  return (
    <div
      className="drag flex h-10 shrink-0 items-center justify-between border-b pl-4 select-none"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-sidebar)' }}
    >
      <div className="flex items-center gap-2.5" style={{ paddingLeft: isMac ? 64 : 0 }}>
        <div
          className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-black text-white"
          style={{ background: 'var(--accent)' }}
        >
          S
        </div>
        <span className="text-[13px] font-semibold tracking-tight">SchoolMod</span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          2.0
        </span>
      </div>

      {!isMac && (
        <div className="flex h-full">
          <button className="titlebar-btn" onClick={() => window.api.win.minimize()}>
            <Minus size={15} />
          </button>
          <button
            className="titlebar-btn"
            onClick={async () => {
              const r = await window.api.win.maximizeToggle()
              if (r.ok) setMaximized(!!r.data)
            }}
          >
            {maximized ? <Copy size={13} /> : <Square size={12} />}
          </button>
          <button
            className="titlebar-btn hover:!bg-red-500 hover:!text-white"
            onClick={() => window.api.win.close()}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

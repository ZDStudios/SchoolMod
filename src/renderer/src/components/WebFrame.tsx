import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink, X } from 'lucide-react'
import { Spinner } from './ui'

interface WebFrameProps {
  src: string
  /** Electron session partition — reuse 'persist:ms365' to share the signed-in Microsoft session. */
  partition: string
  title: string
  /** Omit to render without a close button (for a panel that lives inside a tab). */
  onClose?: () => void
  /** Fill the parent instead of covering the screen as a fullscreen overlay. */
  embedded?: boolean
}

/**
 * An embedded, fully-interactive browser panel (backed by Electron's
 * <webview>) for viewing real school web apps — OneNote, Mathspace, Education
 * Perfect — inside SchoolMod instead of switching to an external browser.
 */
export default function WebFrame({ src, partition, title, onClose, embedded }: WebFrameProps) {
  const ref = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [url, setUrl] = useState(src)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onStart = () => setLoading(true)
    const onStop = () => {
      setLoading(false)
      setCanGoBack(el.canGoBack?.() ?? false)
      setCanGoForward(el.canGoForward?.() ?? false)
      setUrl(el.getURL?.() ?? src)
    }
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-navigate', onStop)
    el.addEventListener('did-navigate-in-page', onStop)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-navigate', onStop)
      el.removeEventListener('did-navigate-in-page', onStop)
    }
  }, [])

  return (
    <div
      className={embedded ? 'flex h-full flex-col' : 'fixed inset-0 z-[80] flex flex-col'}
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-sidebar)' }}>
        {onClose && (
          <>
            <button className="btn btn-ghost px-2 py-1.5" onClick={onClose}>
              <X size={16} />
            </button>
            <div className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
          </>
        )}
        <button className="btn btn-ghost px-2 py-1.5" disabled={!canGoBack} onClick={() => ref.current?.goBack()}>
          <ArrowLeft size={15} />
        </button>
        <button className="btn btn-ghost px-2 py-1.5" disabled={!canGoForward} onClick={() => ref.current?.goForward()}>
          <ArrowRight size={15} />
        </button>
        <button className="btn btn-ghost px-2 py-1.5" onClick={() => ref.current?.reload()}>
          <RotateCw size={14} />
        </button>
        <div className="ml-2 min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-[10px]" style={{ color: 'var(--text-dim)' }}>{url}</p>
        </div>
        {loading && <Spinner size={16} />}
        <button className="btn btn-ghost px-2 py-1.5" onClick={() => window.api.openExternal(url)} title="Open in browser">
          <ExternalLink size={14} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* @ts-ignore -- <webview> is enabled via webviewTag in main window webPreferences */}
        <webview ref={ref} src={src} partition={partition} style={{ width: '100%', height: '100%' }} allowpopups="true" />
      </div>
    </div>
  )
}

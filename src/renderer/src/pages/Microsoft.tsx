import { useEffect, useState } from 'react'
import { ReactNode } from 'react'
import { Grid2x2, FileText, ExternalLink, Clock, Loader2 } from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'
import WebFrame from '../components/WebFrame'
import { useApp } from '../store/app'
import { call } from '../lib/utils'

function FileList({
  title, icon, items, loading, empty, onOpen, opening
}: { title: string; icon: ReactNode; items: any[]; loading: boolean; empty: string; onOpen: (f: any) => void; opening: string }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">{icon} {title}</h2>
      {loading ? (
        <div className="py-6"><Spinner size={20} /></div>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((f, i) => (
            <button
              key={i}
              onClick={() => onOpen(f)}
              disabled={opening === f.name}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              {opening === f.name ? <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} /> : <FileText size={15} style={{ color: 'var(--accent)' }} />}
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-dim)' }}>{f.app}</span>
              <ExternalLink size={13} style={{ color: 'var(--text-dim)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const APPS = [
  { key: 'onenote', name: 'OneNote', color: '#7719aa', emoji: '📓', url: 'https://onenote.cloud.microsoft/' },
  { key: 'word', name: 'Word', color: '#2b579a', emoji: '📘', url: 'https://www.office.com/launch/word/' },
  { key: 'excel', name: 'Excel', color: '#217346', emoji: '📗', url: 'https://www.office.com/launch/excel/' },
  { key: 'powerpoint', name: 'PowerPoint', color: '#d24726', emoji: '📙', url: 'https://www.office.com/launch/powerpoint/' },
  { key: 'teams', name: 'Teams', color: '#5059c9', emoji: '👥', url: 'https://teams.microsoft.com/' },
  { key: 'outlook', name: 'Outlook', color: '#0078d4', emoji: '✉️', url: 'https://outlook.office.com/mail/' },
  { key: 'onedrive', name: 'OneDrive', color: '#0364b8', emoji: '☁️', url: 'https://onedrive.live.com/' },
  { key: 'todo', name: 'To Do', color: '#3366ff', emoji: '✅', url: 'https://to-do.office.com/' }
]

export default function Microsoft() {
  const account = useApp((s) => s.settings?.microsoft.account)
  const [recent, setRecent] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [err, setErr] = useState('')
  const [opening, setOpening] = useState('')
  const [frame, setFrame] = useState<{ url: string; title: string } | null>(null)

  const openNotebook = async (nb: any) => {
    setOpening(nb.name)
    setErr('')
    try {
      const url = await call(window.api.microsoft.getNotebookUrl(nb.name))
      setFrame({ url, title: nb.name })
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setOpening('')
    }
  }

  const loadData = () => {
    setLoading(true)
    Promise.all([
      call(window.api.microsoft.recentFiles()).then(setRecent).catch(() => {}),
      call(window.api.microsoft.oneNote()).then(setNotes).catch(() => {})
    ]).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (account) loadData()
  }, [account])

  const quickConnect = async () => {
    setConnecting(true)
    setErr('')
    try {
      await call(window.api.microsoft.quickConnect())
      await useApp.getState().load()
      loadData()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Microsoft 365"
        subtitle={account ? `Signed in as ${account}` : 'Launch your Office apps in one click'}
        icon={<Grid2x2 size={20} />}
      />

      <div className="mb-8 grid grid-cols-4 gap-3">
        {APPS.map((a) => (
          <button
            key={a.key}
            onClick={() => setFrame({ url: a.url, title: a.name })}
            className="card flex flex-col items-center gap-2 p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl text-2xl" style={{ background: a.color + '22' }}>
              {a.emoji}
            </div>
            <span className="text-sm font-medium">{a.name}</span>
          </button>
        ))}
      </div>

      {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

      {!account ? (
        <div className="card flex items-center justify-between p-6">
          <div>
            <p className="font-semibold">Connect your school account</p>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              One click — signs in with the same school Microsoft account you use for SEQTA. No Azure setup needed.
            </p>
          </div>
          <button className="btn btn-primary" onClick={quickConnect} disabled={connecting}>
            {connecting ? <Spinner size={15} /> : <Grid2x2 size={15} />}
            {connecting ? 'Signing in…' : 'Connect Microsoft'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FileList title="Recent files" icon={<Clock size={17} />} items={recent} loading={loading} empty="No recent files found." onOpen={(f) => f.url && window.api.openExternal(f.url)} opening="" />
          <FileList title="OneNote notebooks" icon={<FileText size={17} />} items={notes} loading={loading} empty="No notebooks found." onOpen={openNotebook} opening={opening} />
        </div>
      )}

      {frame && <WebFrame src={frame.url} partition="persist:ms365" title={frame.title} onClose={() => setFrame(null)} />}
    </div>
  )
}

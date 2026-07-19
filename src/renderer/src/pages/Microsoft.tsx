import { useEffect, useState } from 'react'
import { ReactNode } from 'react'
import { Grid2x2, FileText, ExternalLink, Clock } from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'
import { useApp } from '../store/app'
import { call } from '../lib/utils'

function FileList({
  title, icon, items, loading, empty
}: { title: string; icon: ReactNode; items: any[]; loading: boolean; empty: string }) {
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
              onClick={() => f.url && window.api.openExternal(f.url)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--accent-soft)]"
            >
              <FileText size={15} style={{ color: 'var(--accent)' }} />
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
  { key: 'onenote', name: 'OneNote', color: '#7719aa', emoji: '📓' },
  { key: 'word', name: 'Word', color: '#2b579a', emoji: '📘' },
  { key: 'excel', name: 'Excel', color: '#217346', emoji: '📗' },
  { key: 'powerpoint', name: 'PowerPoint', color: '#d24726', emoji: '📙' },
  { key: 'teams', name: 'Teams', color: '#5059c9', emoji: '👥' },
  { key: 'outlook', name: 'Outlook', color: '#0078d4', emoji: '✉️' },
  { key: 'onedrive', name: 'OneDrive', color: '#0364b8', emoji: '☁️' },
  { key: 'todo', name: 'To Do', color: '#3366ff', emoji: '✅' }
]

export default function Microsoft() {
  const account = useApp((s) => s.settings?.microsoft.account)
  const [recent, setRecent] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [err, setErr] = useState('')

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
            onClick={() => window.api.microsoft.openApp(a.key)}
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
          <FileList title="Recent files" icon={<Clock size={17} />} items={recent} loading={loading} empty="No recent files found." />
          <FileList title="OneNote notebooks" icon={<FileText size={17} />} items={notes} loading={loading} empty="No notebooks found." />
        </div>
      )}
    </div>
  )
}

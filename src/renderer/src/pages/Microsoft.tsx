import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Grid2x2, FileText, ExternalLink, Clock } from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'
import { useApp } from '../store/app'
import { call, timeAgo } from '../lib/utils'

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
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!account) return
    setLoading(true)
    call(window.api.microsoft.graph('GET', '/me/drive/recent'))
      .then((r) => setRecent((r.value || []).slice(0, 8)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [account])

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

      {!account ? (
        <div className="card flex items-center justify-between p-6">
          <div>
            <p className="font-semibold">Connect your school account</p>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Sign in to see your recent OneDrive files and documents right here.
            </p>
          </div>
          <Link to="/settings" className="btn btn-primary">Connect Microsoft</Link>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Clock size={17} /> Recent files
          </h2>
          {loading ? (
            <div className="py-8"><Spinner size={22} /></div>
          ) : recent.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No recent files found.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((f) => (
                <button
                  key={f.id}
                  onClick={() => f.webUrl && window.api.openExternal(f.webUrl)}
                  className="card flex w-full items-center gap-3 p-3.5 text-left transition hover:border-[var(--accent)]"
                >
                  <FileText size={18} style={{ color: 'var(--accent)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    {f.lastModifiedDateTime && (
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        edited {timeAgo(new Date(f.lastModifiedDateTime).getTime())}
                      </p>
                    )}
                  </div>
                  <ExternalLink size={15} style={{ color: 'var(--text-dim)' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

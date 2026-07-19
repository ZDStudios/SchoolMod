import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, RefreshCw } from 'lucide-react'
import { PageHeader, Empty, Spinner, ErrorBanner, StatCard } from '../components/ui'
import { useApp } from '../store/app'
import { call, fmtDate } from '../lib/utils'
import type { SeqtaGrade, SeqtaSubjectAverage } from '../../../shared/types'

const gradeColor = (p: number | null) => {
  if (p == null) return 'var(--text-dim)'
  if (p >= 80) return '#16a34a'
  if (p >= 65) return '#3366ff'
  if (p >= 50) return '#f59e0b'
  return '#ef4444'
}

export default function Grades() {
  const connected = !!useApp((s) => s.settings?.seqta.connected)
  const [data, setData] = useState<{ grades: SeqtaGrade[]; averages: SeqtaSubjectAverage[]; overall: number | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    setErr('')
    try {
      setData(await call(window.api.seqta.grades()))
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (connected) load()
  }, [connected])

  if (!connected)
    return (
      <div className="p-8">
        <PageHeader title="Grades" icon={<BarChart3 size={20} />} />
        <Empty icon={<BarChart3 size={40} />} title="Connect SEQTA to see your grades" action={<Link to="/settings" className="btn btn-primary">Go to Settings</Link>} />
      </div>
    )

  const averages = (data?.averages || []).filter((a) => a.count > 0).sort((a, b) => (b.average || 0) - (a.average || 0))
  const graded = (data?.grades || []).filter((g) => g.percentage != null)

  return (
    <div className="p-8">
      <PageHeader
        title="Grades & averages"
        subtitle="Your marks across every subject, from SEQTA"
        icon={<BarChart3 size={20} />}
        actions={<button className="btn" onClick={load} disabled={loading}>{loading ? <Spinner size={15} /> : <RefreshCw size={15} />} Refresh</button>}
      />
      <ErrorBanner message={err} />

      {loading && !data ? (
        <div className="grid place-items-center py-16"><Spinner size={24} /></div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            <StatCard label="Overall average" value={data?.overall != null ? `${data.overall}%` : '—'} tone="accent" />
            <StatCard label="Subjects graded" value={averages.length} />
            <StatCard label="Assessments marked" value={graded.length} />
            <StatCard label="Top subject" value={averages[0] ? `${averages[0].average}%` : '—'} />
          </div>

          <div className="mb-6 card p-5">
            <h2 className="mb-4 font-semibold">Subject averages</h2>
            {averages.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No marked assessments yet.</p>
            ) : (
              <div className="space-y-3">
                {averages.map((a) => (
                  <div key={a.subject}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{a.subject}</span>
                      <span className="font-semibold" style={{ color: gradeColor(a.average) }}>{a.average}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${a.average || 0}%`, background: gradeColor(a.average) }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Recent results</h2>
            {graded.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No results released yet.</p>
            ) : (
              <div className="space-y-2">
                {graded.slice(0, 30).map((g, i) => (
                  <div key={i} className="flex items-center justify-between border-b py-2 last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{g.subject} · {fmtDate(g.due)}</p>
                    </div>
                    <span className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold text-white" style={{ background: gradeColor(g.percentage) }}>
                      {g.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Calculator, ExternalLink, Sparkles, Send, Flame } from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'
import { useApp } from '../store/app'
import WebFrame from '../components/WebFrame'
import { Markdown } from '../lib/md'
import { call } from '../lib/utils'
import type { ChatMessage } from '../../../shared/types'

const LOG_KEY = 'schoolmod.mathspace.log'

function loadLog(): { date: string; topic: string }[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
  } catch {
    return []
  }
}
function streak(log: { date: string }[]): number {
  const days = new Set(log.map((l) => l.date))
  let s = 0
  const d = new Date()
  for (;;) {
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) {
      s++
      d.setDate(d.getDate() - 1)
    } else break
  }
  return s
}

export default function Mathspace() {
  const aiEnabled = useApp((s) => s.settings?.aiEnabled) !== false
  const [problem, setProblem] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState(loadLog())
  const [showFrame, setShowFrame] = useState(false)

  const solve = async () => {
    if (!problem.trim() || busy) return
    setBusy(true)
    setAnswer('')
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are a patient maths tutor. Solve the problem with clear numbered steps, explain the reasoning ' +
            'behind each step, and end with the final answer in bold. Use plain text maths notation.'
        },
        { role: 'user', content: problem }
      ]
      const res = await call(window.api.claude.chat(messages))
      setAnswer(res)
      const entry = { date: new Date().toISOString().slice(0, 10), topic: problem.slice(0, 60) }
      const next = [entry, ...log].slice(0, 200)
      setLog(next)
      localStorage.setItem(LOG_KEY, JSON.stringify(next))
    } catch (e: any) {
      setAnswer(`⚠️ ${e.message}\n\nCheck your Claude connection in Settings.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Mathspace"
        subtitle={aiEnabled ? 'Launch Mathspace and get step-by-step help from your AI tutor' : 'Launch Mathspace'}
        icon={<Calculator size={20} />}
        actions={
          <button className="btn btn-primary" onClick={() => setShowFrame(true)}>
            <ExternalLink size={15} /> Open Mathspace
          </button>
        }
      />
      {showFrame && (
        <WebFrame src="https://mathspace.co/accounts/login/" partition="persist:mathspace" title="Mathspace" onClose={() => setShowFrame(false)} />
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {aiEnabled && (
          <div className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <Sparkles size={17} style={{ color: 'var(--accent)' }} /> AI maths helper
            </h2>
            <p className="mb-3 text-xs" style={{ color: 'var(--text-dim)' }}>
              Stuck on a Mathspace question? Type it in and get worked steps. (SchoolMod's own tutor — not affiliated with Mathspace.)
            </p>
            <div className="flex items-end gap-2">
              <textarea
                className="input max-h-40 min-h-[46px] flex-1 resize-none"
                rows={2}
                placeholder="e.g. Solve 3x² − 12x + 9 = 0"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    solve()
                  }
                }}
              />
              <button className="btn btn-primary h-[46px]" onClick={solve} disabled={busy || !problem.trim()}>
                {busy ? <Spinner size={16} /> : <Send size={16} />}
              </button>
            </div>
          </div>
          )}

          {aiEnabled && (busy || answer) && (
            <div className="card p-5">
              {busy && !answer ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-dim)' }}>
                  <Spinner size={16} /> Working through it…
                </div>
              ) : (
                <Markdown text={answer} />
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5 text-center">
            <Flame size={28} className="mx-auto" style={{ color: '#f59e0b' }} />
            <div className="mt-1 text-3xl font-bold">{streak(log)}</div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>day practice streak</p>
          </div>
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-semibold">Recent practice</h3>
            {log.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Solve a problem to start your streak.</p>
            ) : (
              <div className="space-y-2">
                {log.slice(0, 6).map((l, i) => (
                  <div key={i} className="text-xs">
                    <p className="truncate font-medium">{l.topic}</p>
                    <p style={{ color: 'var(--text-dim)' }}>{l.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

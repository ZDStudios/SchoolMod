import { useState } from 'react'
import { GraduationCap, ExternalLink, Sparkles, Send, Languages, FlaskConical, Calculator } from 'lucide-react'
import { PageHeader, Spinner } from '../components/ui'
import WebFrame from '../components/WebFrame'
import { Markdown } from '../lib/md'
import { call } from '../lib/utils'
import type { ChatMessage } from '../../../shared/types'

const TOPICS = [
  { icon: Languages, label: 'Languages', hint: 'Vocab, grammar, translation drills' },
  { icon: FlaskConical, label: 'Sciences', hint: 'Definitions, processes, diagrams' },
  { icon: Calculator, label: 'Maths', hint: 'Worked steps and practice' }
]

export default function EducationPerfect() {
  const [topic, setTopic] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [showFrame, setShowFrame] = useState(false)

  const help = async (t?: string) => {
    const q = (t ?? topic).trim()
    if (!q || busy) return
    setBusy(true)
    setAnswer('')
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are a study coach helping a student prepare for Education Perfect tasks (languages, sciences, ' +
            'maths and more). Give a tight, well-structured revision sheet: key facts/vocab, common traps, and 5 ' +
            'quick self-test questions with answers. Use markdown.'
        },
        { role: 'user', content: `Help me revise for: ${q}` }
      ]
      setAnswer(await call(window.api.claude.chat(messages)))
    } catch (e: any) {
      setAnswer(`⚠️ ${e.message}\n\nConnect Claude in Settings first.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Education Perfect"
        subtitle="Launch EP and prep for your tasks with an AI study coach"
        icon={<GraduationCap size={20} />}
        actions={
          <button className="btn btn-primary" onClick={() => setShowFrame(true)}>
            <ExternalLink size={15} /> Open Education Perfect
          </button>
        }
      />
      {showFrame && (
        <WebFrame src="https://www.educationperfect.com/app/" partition="persist:educationperfect" title="Education Perfect" onClose={() => setShowFrame(false)} />
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        {TOPICS.map((t) => (
          <button key={t.label} onClick={() => setTopic(t.label + ': ')} className="card flex items-center gap-3 p-4 text-left transition hover:border-[var(--accent)]">
            <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <t.icon size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{t.hint}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Sparkles size={17} style={{ color: 'var(--accent)' }} /> AI study coach
        </h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-dim)' }}>
          Tell me your EP topic and I'll build a revision sheet with practice questions. (SchoolMod's own tutor — not affiliated with Education Perfect.)
        </p>
        <div className="flex items-end gap-2">
          <textarea
            className="input max-h-40 min-h-[46px] flex-1 resize-none"
            rows={2}
            placeholder="e.g. French: food and restaurant vocabulary"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                help()
              }
            }}
          />
          <button className="btn btn-primary h-[46px]" onClick={() => help()} disabled={busy || !topic.trim()}>
            {busy ? <Spinner size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {(busy || answer) && (
        <div className="card mt-4 p-5">
          {busy && !answer ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-dim)' }}>
              <Spinner size={16} /> Building your revision sheet…
            </div>
          ) : (
            <Markdown text={answer} />
          )}
        </div>
      )}
    </div>
  )
}

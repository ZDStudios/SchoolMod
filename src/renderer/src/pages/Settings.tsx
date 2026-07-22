import { useState } from 'react'
import {
  Palette,
  Sparkles,
  CalendarDays,
  Grid2x2,
  Check,
  Loader2,
  ExternalLink,
  LogOut,
  Download,
  Rocket,
  Copy,
  HardDrive,
  ShieldAlert,
  Bell,
  Monitor,
  Archive,
  Upload
} from 'lucide-react'
import { useApp } from '../store/app'
import { PageHeader, ErrorBanner } from '../components/ui'
import { call } from '../lib/utils'

const ACCENTS = ['#3366ff', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#16a34a', '#0891b2', '#f59e0b']
const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
] as const

export default function Settings() {
  const { settings, save } = useApp()
  if (!settings) return null

  return (
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader title="Settings" subtitle="Connect your accounts and make SchoolMod yours." icon={<Palette size={20} />} />

      <Section icon={<Palette size={18} />} title="Appearance" desc="Theme and accent colour.">
        <div className="mb-4 flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => save({ theme: t.id })}
              className={`btn flex-1 ${settings.theme === t.id ? 'btn-primary' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              onClick={() => save({ accent: c })}
              className="grid h-8 w-8 place-items-center rounded-full transition hover:scale-110"
              style={{ background: c, boxShadow: settings.accent === c ? `0 0 0 3px var(--bg-elev), 0 0 0 5px ${c}` : 'none' }}
            >
              {settings.accent === c && <Check size={15} className="text-white" />}
            </button>
          ))}
        </div>
      </Section>

      <ClaudeSection />
      <ComputerAccessSection />
      <SeqtaSection />
      <MicrosoftSection />
      <RemindersSection />
      <DesktopSection />
      <BackupSection />

      <p className="mt-8 text-center text-xs" style={{ color: 'var(--text-dim)' }}>
        SchoolMod 2.0 · Your data stays on this device. Built for students, by ZDStudios.
      </p>
    </div>
  )
}

function Section({
  icon,
  title,
  desc,
  children
}: {
  icon: React.ReactNode
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="card mb-5 p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {icon}
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function ClaudeSection() {
  const { settings, save } = useApp()
  const claude = settings!.claude
  const [test, setTest] = useState<{ loading: boolean; ok?: boolean; msg?: string }>({ loading: false })
  const [busy, setBusy] = useState<string>('') // '', 'checking', 'installing', 'loggingin'
  const [logs, setLogs] = useState<string[]>([])
  const [url, setUrl] = useState('')

  const addLog = (l: string) => setLogs((prev) => [...prev.slice(-40), l.replace(/\s+$/, '')])

  const runTest = async () => {
    setTest({ loading: true })
    try {
      const r = await call(window.api.claude.ping())
      setTest({ loading: false, ok: r.ok, msg: r.detail })
    } catch (e: any) {
      setTest({ loading: false, ok: false, msg: e.message })
    }
  }

  const connect = async () => {
    setLogs([])
    setUrl('')
    setTest({ loading: false })
    setBusy('checking')
    const offLog = window.api.claude.onSetupLog(addLog)
    const offUrl = window.api.claude.onLoginUrl((u) => {
      setUrl(u)
      window.api.openExternal(u)
    })
    try {
      let st = await call(window.api.claude.status())
      if (!st.installed) {
        setBusy('installing')
        addLog('Installing Claude Code (npm i -g @anthropic-ai/claude-code)…')
        await call(window.api.claude.install())
        st = await call(window.api.claude.status())
      }
      if (!st.authenticated) {
        setBusy('loggingin')
        addLog('Starting login — authorise in your browser when the link opens…')
        await call(window.api.claude.login())
        st = await call(window.api.claude.status())
      }
      setBusy('')
      setTest({
        loading: false,
        ok: st.authenticated,
        msg: st.authenticated ? `Connected via Claude Code ${st.version}` : 'Not authorised yet — try the link again.'
      })
    } catch (e: any) {
      setBusy('')
      setTest({ loading: false, ok: false, msg: e.message })
    } finally {
      offLog()
      offUrl()
    }
  }

  const isCli = claude.mode !== 'wrapper'
  return (
    <Section icon={<Sparkles size={18} />} title="AI provider" desc="Powers the assistant, notebooks, flashcards and study coaches.">
      <div className="mb-4 flex gap-2">
        <button className={`btn flex-1 px-2 text-xs ${claude.mode === 'cli' ? 'btn-primary' : ''}`} onClick={() => save({ claude: { ...claude, mode: 'cli' } })}>
          Claude · one-click
        </button>
        <button className={`btn flex-1 px-2 text-xs ${claude.mode === 'codex' ? 'btn-primary' : ''}`} onClick={() => save({ claude: { ...claude, mode: 'codex' } })}>
          ChatGPT · Codex
        </button>
        <button className={`btn flex-1 px-2 text-xs ${claude.mode === 'wrapper' ? 'btn-primary' : ''}`} onClick={() => save({ claude: { ...claude, mode: 'wrapper' } })}>
          OpenAI wrapper
        </button>
      </div>

      {isCli ? (
        <>
          <div className="mb-3 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
            {claude.mode === 'codex'
              ? 'One click installs the OpenAI Codex CLI and signs you in with your ChatGPT account. Nothing else to configure.'
              : 'One click installs Claude Code and signs you in with your Claude subscription. Nothing else to configure.'}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={connect} disabled={!!busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
              {busy === 'installing' ? 'Installing…' : busy === 'loggingin' ? 'Waiting for login…' : busy ? 'Checking…' : 'Connect Claude'}
            </button>
            <button className="btn" onClick={runTest} disabled={test.loading || !!busy}>
              {test.loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Test
            </button>
            <Field label="Model" >
              <input className="input !py-1.5" value={claude.model} onChange={(e) => save({ claude: { ...claude, model: e.target.value } })} placeholder="claude-sonnet-5" />
            </Field>
          </div>
          {url && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--accent)' }}>
              <span className="flex-1 truncate">Authorise at: {url}</span>
              <button className="btn btn-ghost px-2 py-1" onClick={() => navigator.clipboard.writeText(url)}><Copy size={13} /></button>
              <button className="btn btn-ghost px-2 py-1" onClick={() => window.api.openExternal(url)}><ExternalLink size={13} /></button>
            </div>
          )}
          {logs.length > 0 && (
            <pre className="mt-3 max-h-32 overflow-y-auto rounded-xl p-3 text-[11px]" style={{ background: 'var(--bg)', color: 'var(--text-dim)' }}>
              {logs.join('\n')}
            </pre>
          )}
          {test.msg && <p className={`mt-2 text-xs ${test.ok ? 'text-green-500' : 'text-red-500'}`}>{test.msg}</p>}
        </>
      ) : (
        <>
          <div className="mb-3 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
            Advanced: point SchoolMod at a running{' '}
            <button className="underline" onClick={() => window.api.openExternal('https://github.com/RichardAtCT/claude-code-openai-wrapper')}>
              claude-code-openai-wrapper ↗
            </button>
            .
          </div>
          <Field label="Wrapper base URL">
            <input className="input" value={claude.baseUrl} onChange={(e) => save({ claude: { ...claude, baseUrl: e.target.value } })} placeholder="http://localhost:8000/v1" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="API key (any value)">
              <input className="input" value={claude.apiKey} onChange={(e) => save({ claude: { ...claude, apiKey: e.target.value } })} />
            </Field>
            <Field label="Model">
              <input className="input" value={claude.model} onChange={(e) => save({ claude: { ...claude, model: e.target.value } })} placeholder="claude-sonnet-5" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn" onClick={runTest} disabled={test.loading}>
              {test.loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Test connection
            </button>
            {test.msg && <span className={`text-xs ${test.ok ? 'text-green-500' : 'text-red-500'}`}>{test.msg.slice(0, 90)}</span>}
          </div>
        </>
      )}
    </Section>
  )
}

/** A labelled on/off row — the shape every boolean setting on this page uses. */
function Toggle({
  label,
  desc,
  on,
  onChange
}: {
  label: string
  desc: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--bg)' }}>
      <div className="pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
          {desc}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--border)' }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: on ? 'translateX(22px)' : 'translateX(4px)' }}
        />
      </button>
    </div>
  )
}

function RemindersSection() {
  const { settings, save } = useApp()
  const n = settings!.notifications
  const [tested, setTested] = useState(false)
  const set = (patch: Partial<typeof n>) => save({ notifications: { ...n, ...patch } })

  return (
    <Section icon={<Bell size={18} />} title="Reminders" desc="Desktop alerts before class and when work is due.">
      <div className="space-y-2">
        <Toggle
          label="Enable reminders"
          desc="The master switch for every desktop notification below."
          on={n.enabled}
          onChange={(v) => set({ enabled: v })}
        />
        <Toggle
          label="Before each period"
          desc="A heads-up so you're not sprinting across campus after the bell."
          on={n.bells}
          onChange={(v) => set({ bells: v })}
        />
        <Toggle
          label="Assessments due"
          desc="Alerts the day before and the morning something is due."
          on={n.assessments}
          onChange={(v) => set({ assessments: v })}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Field label="Warn me this many minutes early">
          <input
            type="number"
            min={1}
            max={30}
            className="input w-24"
            value={n.bellLeadMinutes}
            onChange={(e) => set({ bellLeadMinutes: Math.max(1, Math.min(30, Number(e.target.value) || 5)) })}
          />
        </Field>
      </div>
      <button
        className="btn mt-3"
        onClick={async () => {
          await call(window.api.desktop.notifyTest())
          setTested(true)
        }}
      >
        {tested ? <Check size={15} /> : <Bell size={15} />}
        {tested ? 'Sent — check your notifications' : 'Send a test notification'}
      </button>
    </Section>
  )
}

function DesktopSection() {
  const { settings, save } = useApp()
  const d = settings!.desktop
  const [msg, setMsg] = useState('')
  // Every desktop setting needs the main process to re-register tray/hotkey/login item.
  const set = async (patch: Partial<typeof d>) => {
    await save({ desktop: { ...d, ...patch } })
    const r = await call(window.api.desktop.refresh())
    if (patch.quickExplainShortcut !== undefined) {
      setMsg(r?.shortcutOk ? 'Shortcut registered.' : 'That shortcut is taken by another app — try a different one.')
    }
  }

  return (
    <Section icon={<Monitor size={18} />} title="Desktop" desc="Tray, startup and the global quick-explain hotkey.">
      <div className="space-y-2">
        <Toggle
          label="Keep running in the tray"
          desc="Closing the window tucks SchoolMod into the system tray so reminders keep working. Quit from the tray menu."
          on={d.tray}
          onChange={(v) => set({ tray: v })}
        />
        <Toggle
          label="Start when I log in"
          desc="Launches quietly into the tray when your computer starts."
          on={d.autoLaunch}
          onChange={(v) => set({ autoLaunch: v })}
        />
      </div>
      <div className="mt-3">
        <Field label="Quick-explain hotkey">
          <input
            className="input"
            value={d.quickExplainShortcut}
            onChange={(e) => save({ desktop: { ...d, quickExplainShortcut: e.target.value } })}
            onBlur={(e) => set({ quickExplainShortcut: e.target.value })}
            placeholder="CommandOrControl+Shift+E"
          />
        </Field>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
          Copy anything anywhere on your computer, press this, and SchoolMod pops up with the assistant explaining it.
        </p>
        {msg && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
            {msg}
          </p>
        )}
      </div>
    </Section>
  )
}

function BackupSection() {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const run = async (kind: 'export' | 'import') => {
    setBusy(kind)
    setErr('')
    setMsg('')
    try {
      if (kind === 'export') {
        const r = await call(window.api.backup.export())
        setMsg(r?.saved ? `Saved ${r.notebooks} notebooks and ${r.decks} decks.` : '')
      } else {
        const r = await call(window.api.backup.import())
        setMsg(r?.imported ? `Restored — you now have ${r.notebooks} notebooks and ${r.decks} decks.` : '')
      }
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <Section icon={<Archive size={18} />} title="Backup" desc="Move to a new computer, or keep a safety copy.">
      <ErrorBanner message={err} />
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={!!busy} onClick={() => run('export')}>
          {busy === 'export' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Export backup
        </button>
        <button className="btn flex-1" disabled={!!busy} onClick={() => run('import')}>
          {busy === 'import' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Restore backup
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
          {msg}
        </p>
      )}
      <div className="mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          Backups include your notebooks, decks and preferences — but <strong>never your passwords</strong>, so a
          backup file is safe to email or keep in cloud storage. You'll just reconnect SEQTA and Microsoft once.
          Restoring merges rather than overwrites, so nothing on this machine gets wiped.
        </span>
      </div>
    </Section>
  )
}

function ComputerAccessSection() {
  const { settings, save } = useApp()
  const on = !!settings!.computerAccess
  return (
    <Section icon={<HardDrive size={18} />} title="Computer access" desc="Let the assistant browse, read and write files on this device.">
      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--bg)' }}>
        <div className="pr-4">
          <p className="text-sm font-medium">Allow file access</p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
            When on, the assistant can list folders, read and write text files, search filenames, and open a file for
            you — e.g. "find my Humanities essay draft", "save this summary to notes.txt on my desktop".
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          onClick={() => save({ computerAccess: !on })}
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ background: on ? 'var(--accent)' : 'var(--border)' }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full bg-white transition-transform"
            style={{ transform: on ? 'translateX(22px)' : 'translateX(4px)' }}
          />
        </button>
      </div>
      <div className="mt-3 flex gap-2 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          The assistant can create, edit and read files you point it at — but even with this on, it can never{' '}
          <strong>delete a file/folder or run a program or command</strong>. Off by default; turn it off any time.
        </span>
      </div>
    </Section>
  )
}

function SeqtaSection() {
  const { settings, save } = useApp()
  const seqta = settings!.seqta
  const [url, setUrl] = useState(seqta.baseUrl)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [state, setState] = useState<{ loading: boolean; err?: string; info?: string }>({ loading: false })

  const setMcp = (patch: Partial<typeof seqta.mcp>) =>
    save({ seqta: { ...seqta, mcp: { ...seqta.mcp, ...patch } } })
  const scriptPath = seqta.mcp.args[0] || ''

  const connectSso = async () => {
    setState({ loading: true, err: '' })
    try {
      const r = await call(window.api.seqta.connectSso())
      await useApp.getState().load()
      setState({ loading: false, info: `Connected as ${r.name}` })
    } catch (e: any) {
      setState({ loading: false, err: e.message })
    }
  }

  const testMcp = async () => {
    setState({ loading: true })
    try {
      const r = await call(window.api.seqta.testMcp())
      await useApp.getState().load()
      setState({ loading: false, info: `Connected · ${r.info.split('\n')[0]}` })
    } catch (e: any) {
      setState({ loading: false, err: e.message })
    }
  }
  const connectDirect = async () => {
    setState({ loading: true })
    try {
      await call(window.api.seqta.login(url, user, pass))
      await useApp.getState().load()
      setState({ loading: false })
      setPass('')
    } catch (e: any) {
      setState({ loading: false, err: e.message })
    }
  }
  const disconnect = async () => {
    await window.api.seqta.logout()
    await useApp.getState().load()
    setState({ loading: false })
  }

  return (
    <Section icon={<CalendarDays size={18} />} title="SEQTA Learn" desc="Timetable, assessments, notices & homework.">
      {seqta.connected ? (
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--bg)' }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-green-500/15 text-green-500">
              <Check size={14} />
            </span>
            Connected via <strong>{seqta.mode === 'mcp' ? 'MCP server' : seqta.mode === 'sso' ? 'Microsoft SSO' : 'direct login'}</strong>
            {seqta.displayName && <> · {seqta.displayName}</>}
          </div>
          <button className="btn btn-ghost text-red-500" onClick={disconnect}>
            <LogOut size={15} /> Disconnect
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <button className={`btn flex-1 px-2 text-xs ${seqta.mode === 'sso' ? 'btn-primary' : ''}`} onClick={() => save({ seqta: { ...seqta, mode: 'sso' } })}>
              SSO · recommended
            </button>
            <button className={`btn flex-1 px-2 text-xs ${seqta.mode === 'mcp' ? 'btn-primary' : ''}`} onClick={() => save({ seqta: { ...seqta, mode: 'mcp' } })}>
              MCP server
            </button>
            <button className={`btn flex-1 px-2 text-xs ${seqta.mode === 'direct' ? 'btn-primary' : ''}`} onClick={() => save({ seqta: { ...seqta, mode: 'direct' } })}>
              Direct login
            </button>
          </div>
          <ErrorBanner message={state.err || ''} />

          {seqta.mode === 'sso' ? (
            <>
              <div className="mb-3 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
                Signs in through your school's Microsoft account and loads your name, photo, timetable, assessments,
                homework and notices. Needs Python with <code>requests</code> + <code>beautifulsoup4</code> (a headless
                browser is used as a fallback).
              </div>
              <Field label="SEQTA portal URL">
                <input className="input" value={seqta.baseUrl} onChange={(e) => save({ seqta: { ...seqta, baseUrl: e.target.value } })} placeholder="https://students.yourschool.wa.edu.au" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="School email">
                  <input className="input" value={seqta.email} onChange={(e) => save({ seqta: { ...seqta, email: e.target.value } })} autoComplete="off" placeholder="you@students.school.edu" />
                </Field>
                <Field label="Password">
                  <input className="input" type="password" value={seqta.password} onChange={(e) => save({ seqta: { ...seqta, password: e.target.value } })} autoComplete="off" />
                </Field>
              </div>
              <button className="btn btn-primary" onClick={connectSso} disabled={state.loading || !seqta.baseUrl || !seqta.email || !seqta.password}>
                {state.loading ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}
                Connect SEQTA
              </button>
              {state.info && <p className="mt-2 text-xs text-green-500">{state.info}</p>}
              <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                Credentials are stored locally on this device only and used solely to sign in to your school.
              </p>
            </>
          ) : seqta.mode === 'mcp' ? (
            <>
              <div className="mb-3 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
                Uses your{' '}
                <button className="underline" onClick={() => window.api.openExternal('https://github.com/ZDStudios/Seqta-MCP-Server')}>
                  Seqta-MCP-Server ↗
                </button>{' '}
                — handles Microsoft SSO automatically. Point SchoolMod at how to launch it.
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Command">
                  <input className="input" value={seqta.mcp.command} onChange={(e) => setMcp({ command: e.target.value })} placeholder="python" />
                </Field>
                <div className="col-span-2">
                  <Field label="Server script path">
                    <input className="input" value={scriptPath} onChange={(e) => setMcp({ args: e.target.value ? [e.target.value] : [] })} placeholder="C:\path\to\seqta_mcp.py" />
                  </Field>
                </div>
              </div>
              <Field label="Working directory (optional)">
                <input className="input" value={seqta.mcp.cwd} onChange={(e) => setMcp({ cwd: e.target.value })} placeholder="C:\path\to\Seqta-MCP-Server" />
              </Field>
              <button className="btn btn-primary" onClick={testMcp} disabled={state.loading || !seqta.mcp.command || !scriptPath}>
                {state.loading ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}
                Connect & test
              </button>
              {state.info && <p className="mt-2 text-xs text-green-500">{state.info}</p>}
            </>
          ) : (
            <>
              <Field label="SEQTA portal URL">
                <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourschool.seqta.com.au" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username">
                  <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Password">
                  <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
                </Field>
              </div>
              <button className="btn btn-primary" onClick={connectDirect} disabled={state.loading || !url || !user}>
                {state.loading ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}
                Connect SEQTA
              </button>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                Credentials go straight to your school's SEQTA server and are never stored — only the session cookie is kept. (SSO schools should use the MCP option.)
              </p>
            </>
          )}
        </>
      )}
    </Section>
  )
}

function MicrosoftSection() {
  const { settings } = useApp()
  const ms = settings!.microsoft
  const [clientId, setClientId] = useState(ms.clientId)
  const [tenant, setTenant] = useState(ms.tenant)
  const [flow, setFlow] = useState<{ code?: string; uri?: string; err?: string; loading?: boolean }>({})

  const saveIds = async () => {
    await useApp.getState().save({ microsoft: { ...ms, clientId, tenant } })
  }
  const connect = async () => {
    await saveIds()
    setFlow({ loading: true })
    try {
      const r = await call(window.api.microsoft.deviceLogin())
      setFlow({ code: r.userCode, uri: r.verificationUri })
      navigator.clipboard.writeText(r.userCode).catch(() => {})
      window.api.openExternal(r.verificationUri)
      const off = window.api.microsoft.onLoginDone((res) => {
        off()
        if (res.ok) {
          useApp.getState().load()
          setFlow({})
        } else setFlow({ err: res.error })
      })
    } catch (e: any) {
      setFlow({ err: e.message })
    }
  }

  return (
    <Section icon={<Grid2x2 size={18} />} title="Microsoft 365" desc="OneNote, Word, Excel, Teams, OneDrive & Outlook.">
      {ms.account ? (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--bg)' }}>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-green-500/15 text-green-500">
            <Check size={14} />
          </span>
          Signed in as <strong>{ms.account}</strong>
        </div>
      ) : (
        <>
          <ErrorBanner message={flow.err || ''} />
          <div className="mb-3 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
            Register a free public-client app in Azure (Entra ID) with device-code flow enabled, then paste its
            client id below.{' '}
            <button className="underline" onClick={() => window.api.openExternal('https://learn.microsoft.com/entra/identity-platform/quickstart-register-app')}>
              How ↗
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Application (client) ID">
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
              </Field>
            </div>
            <Field label="Tenant">
              <input className="input" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="common" />
            </Field>
          </div>
          {flow.code ? (
            <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--accent)' }}>
              Go to{' '}
              <button className="font-semibold underline" onClick={() => window.api.openExternal(flow.uri!)}>
                {flow.uri} <ExternalLink size={12} className="inline" />
              </button>{' '}
              and enter this code (copied to your clipboard):
              <button
                onClick={() => navigator.clipboard.writeText(flow.code!)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-center font-mono text-2xl font-bold tracking-widest"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {flow.code} <Copy size={16} />
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={connect} disabled={flow.loading || !clientId}>
              {flow.loading ? <Loader2 size={15} className="animate-spin" /> : <Grid2x2 size={15} />}
              Connect Microsoft
            </button>
          )}
        </>
      )}
    </Section>
  )
}

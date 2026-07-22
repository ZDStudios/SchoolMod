import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, CalendarDays, Clock, MapPin, User, FileText, Megaphone, RefreshCw, ClipboardList, Mail, FileBadge2, GraduationCap, ChevronLeft, Search, Paperclip, History } from 'lucide-react'
import { PageHeader, Empty, Spinner, ErrorBanner } from '../components/ui'
import WebFrame from '../components/WebFrame'
import { useApp } from '../store/app'
import { call, fmtDate, daysUntil } from '../lib/utils'
import type { SeqtaLesson, SeqtaAssessment, SeqtaNotice, SeqtaHomeworkGroup, SeqtaMessage, SeqtaReport, SeqtaSubject, SeqtaCourseContent } from '../../../shared/types'

export default function Seqta() {
  const connected = !!useApp((s) => s.settings?.seqta.connected)
  const [tab, setTab] = useState<'timetable' | 'assessments' | 'homework' | 'notices' | 'messages' | 'reports' | 'courses' | 'browse'>('timetable')
  const [week, setWeek] = useState(false)
  const [lessons, setLessons] = useState<SeqtaLesson[]>([])
  const [assessments, setAssessments] = useState<SeqtaAssessment[]>([])
  const [notices, setNotices] = useState<SeqtaNotice[]>([])
  const [homework, setHomework] = useState<SeqtaHomeworkGroup[]>([])
  const [messages, setMessages] = useState<SeqtaMessage[]>([])
  const [reports, setReports] = useState<SeqtaReport[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const refresh = async () => {
    if (!connected) return
    setLoading(true)
    setErr('')
    try {
      const [l, a, n, h] = await Promise.all([
        call(week ? window.api.seqta.timetableWeek() : window.api.seqta.timetable()).catch(() => []),
        call(window.api.seqta.assessments()).catch(() => []),
        call(window.api.seqta.notices()).catch(() => []),
        call(window.api.seqta.homework()).catch(() => [])
      ])
      setLessons(l)
      setAssessments(a)
      setNotices(n)
      setHomework(h)
      // messages + reports are SSO-only extras; fetch lazily, ignore failures
      call(window.api.seqta.messages()).then(setMessages).catch(() => {})
      call(window.api.seqta.reports()).then(setReports).catch(() => {})
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [connected, week])

  if (!connected)
    return (
      <div className="p-8">
        <PageHeader title="SEQTA Learn" icon={<CalendarDays size={20} />} />
        <Empty
          icon={<CalendarDays size={40} />}
          title="Connect your SEQTA account"
          hint="Add your school's SEQTA portal and sign in to see your timetable, assessments and notices."
          action={
            <Link to="/settings" className="btn btn-primary">
              Go to Settings
            </Link>
          }
        />
      </div>
    )

  const tabs = [
    { id: 'timetable', label: 'Timetable', icon: Clock, count: lessons.length },
    { id: 'assessments', label: 'Assessments', icon: FileText, count: assessments.length },
    { id: 'homework', label: 'Homework', icon: ClipboardList, count: homework.length },
    { id: 'notices', label: 'Notices', icon: Megaphone, count: notices.length },
    { id: 'messages', label: 'Messages', icon: Mail, count: messages.length },
    { id: 'reports', label: 'Reports', icon: FileBadge2, count: reports.length },
    { id: 'courses', label: 'Courses', icon: GraduationCap, count: null },
    { id: 'browse', label: 'Browse', icon: Globe, count: null }
  ] as const

  return (
    <div className="p-8">
      <PageHeader
        title="SEQTA Learn"
        subtitle="Your school day at a glance"
        icon={<CalendarDays size={20} />}
        actions={
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? <Spinner size={15} /> : <RefreshCw size={15} />} Refresh
          </button>
        }
      />
      <ErrorBanner message={err} />

      <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'text-white' : ''}`}
            style={{ background: tab === t.id ? 'var(--accent)' : 'transparent' }}
          >
            <t.icon size={15} /> {t.label}
            {t.count !== null && (
              <span className="rounded-full px-1.5 text-xs" style={{ background: tab === t.id ? 'rgba(255,255,255,.2)' : 'var(--accent-soft)', color: tab === t.id ? '#fff' : 'var(--accent)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'timetable' && (
        <div className="mb-3 flex gap-1 rounded-lg p-1 w-fit" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
          {[{ k: false, l: 'Today' }, { k: true, l: 'Week' }].map((o) => (
            <button key={o.l} onClick={() => setWeek(o.k)} className={`rounded-md px-3 py-1 text-xs font-medium ${week === o.k ? 'text-white' : ''}`} style={{ background: week === o.k ? 'var(--accent)' : 'transparent' }}>{o.l}</button>
          ))}
        </div>
      )}
      {loading && lessons.length === 0 ? (
        <div className="grid place-items-center py-16"><Spinner size={24} /></div>
      ) : tab === 'timetable' ? (
        <Timetable lessons={lessons} week={week} />
      ) : tab === 'assessments' ? (
        <Assessments items={assessments} />
      ) : tab === 'homework' ? (
        <Homework groups={homework} />
      ) : tab === 'notices' ? (
        <Notices items={notices} />
      ) : tab === 'messages' ? (
        <Messages items={messages} />
      ) : tab === 'reports' ? (
        <Reports items={reports} />
      ) : tab === 'courses' ? (
        <Courses />
      ) : (
        <BrowseSeqta />
      )}
    </div>
  )
}

function LessonRow({ l }: { l: SeqtaLesson }) {
  return (
    <div className="card flex items-stretch gap-4 overflow-hidden p-0">
      <div className="w-1.5 shrink-0" style={{ background: l.colour || 'var(--accent)' }} />
      <div className="flex flex-1 items-center justify-between py-3.5 pr-4">
        <div>
          <p className="font-semibold">{l.description}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
            {l.staff && <span className="flex items-center gap-1"><User size={12} /> {l.staff}</span>}
            {l.room && <span className="flex items-center gap-1"><MapPin size={12} /> {l.room}</span>}
          </div>
        </div>
        <div className="text-right text-sm font-medium">
          <div>{l.from}</div>
          <div style={{ color: 'var(--text-dim)' }}>{l.until}</div>
        </div>
      </div>
    </div>
  )
}

function Timetable({ lessons, week }: { lessons: SeqtaLesson[]; week: boolean }) {
  if (!lessons.length)
    return <Empty icon={<Clock size={36} />} title="No lessons scheduled" hint="Enjoy the break, or check another day soon." />
  if (!week) return <div className="space-y-2.5">{lessons.map((l, i) => <LessonRow key={i} l={l} />)}</div>

  const days = [...new Set(lessons.map((l) => l.day))].filter(Boolean).sort()
  return (
    <div className="space-y-5">
      {days.map((day) => (
        <div key={day}>
          <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            {new Date(day!).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <div className="space-y-2">{lessons.filter((l) => l.day === day).map((l, i) => <LessonRow key={i} l={l} />)}</div>
        </div>
      ))}
    </div>
  )
}

function Messages({ items }: { items: SeqtaMessage[] }) {
  if (!items.length) return <Empty icon={<Mail size={36} />} title="Inbox empty" hint="No messages from your school right now." />
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div key={m.id} className="card flex items-center justify-between p-3.5">
          <div className="min-w-0">
            <p className={`truncate text-sm ${m.read ? '' : 'font-bold'}`}>{m.subject}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{m.sender}</p>
          </div>
          <div className="flex items-center gap-2">
            {!m.read && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />}
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{m.date}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Reports({ items }: { items: SeqtaReport[] }) {
  if (!items.length) return <Empty icon={<FileBadge2 size={36} />} title="No reports yet" hint="Report cards appear here when released." />
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <button key={r.uuid} onClick={() => window.api.seqta.openReport(r.uuid)} className="card flex w-full items-center justify-between p-4 text-left transition hover:border-[var(--accent)]">
          <div>
            <p className="font-semibold">{r.types}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{r.terms} · {r.year}</p>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}>
            <FileBadge2 size={16} /> Open PDF
          </div>
        </button>
      ))}
    </div>
  )
}

function Assessments({ items }: { items: SeqtaAssessment[] }) {
  if (!items.length)
    return <Empty icon={<FileText size={36} />} title="No upcoming assessments" hint="You're all caught up." />
  return (
    <div className="space-y-2.5">
      {items.map((a) => {
        const d = daysUntil(a.due)
        const urgent = d !== null && d <= 3
        return (
          <div key={a.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-semibold">{a.title}</p>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {a.subject || a.code}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{fmtDate(a.due)}</p>
              {d !== null && (
                <span className={`text-xs font-semibold ${urgent ? 'text-red-500' : ''}`} style={{ color: urgent ? undefined : 'var(--text-dim)' }}>
                  {d < 0 ? 'overdue' : d === 0 ? 'due today' : `in ${d} day${d === 1 ? '' : 's'}`}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Homework({ groups }: { groups: SeqtaHomeworkGroup[] }) {
  if (!groups.length)
    return <Empty icon={<ClipboardList size={36} />} title="No homework set" hint="Nothing on the homework dashboard right now." />
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={i} className="card p-4">
          <p className="mb-2 font-semibold" style={{ color: 'var(--accent)' }}>{g.subject}</p>
          <ul className="space-y-1.5">
            {g.items.map((it, j) => (
              <li key={j} className="flex gap-2 text-sm" style={{ color: 'var(--text-dim)' }}>
                <span style={{ color: 'var(--accent)' }}>•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Notices({ items }: { items: SeqtaNotice[] }) {
  if (!items.length)
    return <Empty icon={<Megaphone size={36} />} title="No notices today" hint="Check back tomorrow morning." />
  return (
    <div className="space-y-2.5">
      {items.map((n) => (
        <div key={n.id} className="card p-4">
          <div className="flex items-center gap-2">
            {n.label && <span className="chip" style={{ background: (n.colour || 'var(--accent)') + '22', color: n.colour || 'var(--accent)' }}>{n.label}</span>}
            <p className="font-semibold">{n.title}</p>
          </div>
          {n.content && <p className="mt-1.5 text-sm" style={{ color: 'var(--text-dim)' }}>{n.content.slice(0, 400)}</p>}
          {n.staff && <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>— {n.staff}</p>}
        </div>
      ))}
    </div>
  )
}

function Courses() {
  const [subjects, setSubjects] = useState<SeqtaSubject[]>([])
  const [q, setQ] = useState('')
  // SEQTA returns every period ever enrolled in, so default to the current one
  // (this year) and let the student opt into seeing past years.
  const [showPast, setShowPast] = useState(false)
  const [active, setActive] = useState<SeqtaSubject | null>(null)
  const [content, setContent] = useState<SeqtaCourseContent[] | null>(null)
  const [lessonIdx, setLessonIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    call(window.api.seqta.subjectsList())
      .then(setSubjects)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const open = async (s: SeqtaSubject) => {
    setActive(s)
    setContent(null)
    setLessonIdx(0)
    setLoadingContent(true)
    setErr('')
    try {
      setContent(await call(window.api.seqta.courseContent(s.title)))
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoadingContent(false)
    }
  }

  if (active) {
    const course = content?.[0]
    const lessons = course?.lessons || []
    const lesson = lessons[lessonIdx]
    return (
      <div>
        <button className="btn btn-ghost mb-3 px-2" onClick={() => setActive(null)}>
          <ChevronLeft size={15} /> All subjects
        </button>
        <ErrorBanner message={err} />

        <div className="mb-3 flex items-center gap-2">
          <GraduationCap size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold">{active.title}</h2>
          <span className="chip">{active.code}</span>
          {!active.current && (
            <span className="chip" style={{ background: 'var(--border)', color: 'var(--text-dim)' }}>{active.period}</span>
          )}
        </div>

        {loadingContent ? (
          <div className="card grid place-items-center py-16"><Spinner size={22} /></div>
        ) : !course ? (
          <Empty icon={<GraduationCap size={36} />} title="No course content" hint="Nothing has been published for this subject yet." />
        ) : (
          <>
            {course.files.length > 0 && (
              <div className="card mb-3 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>Course files</p>
                <div className="flex flex-wrap gap-1.5">
                  {course.files.map((f, j) => (
                    <span key={j} className="chip"><Paperclip size={11} /> {f}</span>
                  ))}
                </div>
              </div>
            )}

            {lessons.length === 0 ? (
              <Empty icon={<ClipboardList size={36} />} title="No lessons published" hint="Your teacher hasn't added a lesson plan for this subject yet." />
            ) : (
              <div className="grid grid-cols-[260px_1fr] gap-4">
                {/* Lesson list */}
                <div className="card flex max-h-[60vh] flex-col p-3">
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                    {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
                  </p>
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                    {lessons.map((l, i) => (
                      <button
                        key={i}
                        onClick={() => setLessonIdx(i)}
                        className="w-full rounded-lg px-2.5 py-2 text-left text-xs transition"
                        style={{
                          background: i === lessonIdx ? 'var(--accent-soft)' : 'transparent',
                          color: i === lessonIdx ? 'var(--accent)' : 'var(--text)'
                        }}
                      >
                        <p className="font-medium" style={{ color: 'var(--text-dim)' }}>T{l.term} W{l.week}</p>
                        <p className="line-clamp-2">{l.title || '(untitled lesson)'}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected lesson */}
                <div className="card max-h-[60vh] overflow-y-auto p-5">
                  {lesson ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                        Term {lesson.term} · Week {lesson.week}
                      </p>
                      <h3 className="mt-1 text-lg font-bold">{lesson.title || '(untitled lesson)'}</h3>
                      {lesson.files.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {lesson.files.map((f, j) => (
                            <span key={j} className="chip"><Paperclip size={11} /> {f}</span>
                          ))}
                        </div>
                      )}
                      {lesson.html ? (
                        /*
                         * Teachers author these in a rich-text editor, so the
                         * markup carries the meaning — colour-coded outcome
                         * boxes, tables, headings. It's rendered on a light
                         * "page" surface because SEQTA's inline styles assume a
                         * white background; on the dark theme its own
                         * unstyled text would come out white-on-yellow.
                         * Sanitised in the main process before it gets here.
                         */
                        <div
                          className="seqta-lesson mt-4 overflow-x-auto rounded-xl p-4"
                          style={{ background: '#fff', color: '#1a1a1a' }}
                          dangerouslySetInnerHTML={{ __html: lesson.html }}
                        />
                      ) : lesson.notes ? (
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{lesson.notes}</p>
                      ) : (
                        <p className="mt-4 text-sm" style={{ color: 'var(--text-dim)' }}>No notes for this lesson.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Select a lesson.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const pool = subjects.filter((s) => (showPast ? true : s.current))
  const filtered = pool.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase().includes(q.toLowerCase()))
  const pastCount = subjects.filter((s) => !s.current).length

  return (
    <div>
      <ErrorBanner message={err} />
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
          <input className="input pl-8" placeholder="Search your subjects…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {pastCount > 0 && (
          <button className={`btn shrink-0 text-xs ${showPast ? 'btn-primary' : ''}`} onClick={() => setShowPast((v) => !v)}>
            <History size={14} /> {showPast ? 'This year only' : `Past years (${pastCount})`}
          </button>
        )}
      </div>
      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : filtered.length === 0 ? (
        <Empty icon={<GraduationCap size={36} />} title="No subjects found" />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.code}
              onClick={() => open(s)}
              className="card flex items-center gap-3 p-4 text-left transition hover:border-[var(--accent)]"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <GraduationCap size={17} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  {s.code}
                  {!s.current && ` · ${s.period}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * The real SEQTA site, embedded.
 *
 * The main process plants the already-validated JSESSIONID into a persistent
 * partition first, so this opens straight onto the portal instead of bouncing
 * through a second Microsoft login.
 */
function BrowseSeqta() {
  const [cfg, setCfg] = useState<{ url: string; partition: string } | null>(null)
  const [err, setErr] = useState('')
  const [height, setHeight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    call(window.api.seqta.webview())
      .then(setCfg)
      .catch((e) => setErr(e.message))
  }, [])

  /*
   * Size the panel from its own measured position rather than a fixed vh.
   * A hardcoded height (70vh) sat below the page header and tab bar, so the
   * bottom — and on shorter windows the toolbar itself — ran off the screen.
   * Measuring means it always fits whatever is above it.
   */
  useEffect(() => {
    const fit = () => {
      const el = boxRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setHeight(Math.max(360, window.innerHeight - top - 24))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [cfg])

  if (err) return <ErrorBanner message={err} />
  if (!cfg) return <div className="card grid place-items-center py-16"><Spinner size={22} /></div>

  return (
    <div ref={boxRef} className="card overflow-hidden" style={{ height: height ? `${height}px` : '60vh' }}>
      <WebFrame src={cfg.url} partition={cfg.partition} title="SEQTA Learn" embedded />
    </div>
  )
}

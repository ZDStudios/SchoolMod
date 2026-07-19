import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import { useApp } from './store/app'
import { Spinner } from './components/ui'

import Dashboard from './pages/Dashboard'
import Assistant from './pages/Assistant'
import Seqta from './pages/Seqta'
import Notebooks from './pages/Notebooks'
import Flashcards from './pages/Flashcards'
import Microsoft from './pages/Microsoft'
import Mathspace from './pages/Mathspace'
import EducationPerfect from './pages/EducationPerfect'
import Grades from './pages/Grades'
import Planner from './pages/Planner'
import Settings from './pages/Settings'

export default function App() {
  const { loaded, load } = useApp()

  useEffect(() => {
    load().then(() => useApp.getState().refreshIdentity())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => useApp.getState().applyTheme()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
          {!loaded ? (
            <div className="grid h-full place-items-center">
              <Spinner size={26} />
            </div>
          ) : (
            <div className="animate-fade-in flex min-h-full flex-col">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/notebooks" element={<Notebooks />} />
                <Route path="/flashcards" element={<Flashcards />} />
                <Route path="/seqta" element={<Seqta />} />
                <Route path="/microsoft" element={<Microsoft />} />
                <Route path="/mathspace" element={<Mathspace />} />
                <Route path="/educationperfect" element={<EducationPerfect />} />
                <Route path="/grades" element={<Grades />} />
                <Route path="/planner" element={<Planner />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
          )}
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

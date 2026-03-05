import { useEffect, useState } from 'react'
import { useAgentStore } from './stores/agentStore'
import { useAgentEvents } from './hooks/useAgentEvents'
import { scaled } from './utils/scale'
import { NeuralMap } from './components/NeuralMap'
import { ActivityStream } from './components/ActivityStream'
import { CommandBar } from './components/CommandBar'
import { QuickActions } from './components/QuickActions'
import { AgentSwarm } from './components/AgentSwarm'
import { ConversationThread } from './components/ConversationThread'
import { Sidebar } from './components/Sidebar'
import { Onboarding } from './components/Onboarding'
import { FileChangeFeed } from './components/FileChangeFeed'
import { DevServerPanel } from './components/DevServerPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ProfileBuilder } from './components/ProfileBuilder'

const NAV_TABS = [
  { id: 'stream', label: 'Stream' },
  { id: 'graph', label: 'Graph' },
  { id: 'changes', label: 'Changes' },
  { id: 'server', label: 'Server' },
  { id: 'config', label: 'Config' },
  { id: 'profile', label: 'Profile' },
] as const

type NavTab = (typeof NAV_TABS)[number]['id']

function App(): JSX.Element {
  useAgentEvents()

  const isAuthenticated = useAgentStore((s) => s.isAuthenticated)
  const uiScale = useAgentStore((s) => s.uiScale)
  const [activeTab, setActiveTab] = useState<NavTab>('stream')
  const [onboardingDone, setOnboardingDone] = useState(() => localStorage.getItem('vibeflow:onboarding-complete') === 'true')

  // Apply UI scale on mount and when it changes
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale))
  }, [uiScale])

  useEffect(() => {
    window.api.checkAuth().then((result) => {
      useAgentStore.getState().handleEvent({
        type: 'auth:status',
        installed: result.installed,
        authenticated: result.authenticated
      })
    })
  }, [])

  // Listen for onboarding completion via storage event
  useEffect(() => {
    const handler = (): void => {
      if (localStorage.getItem('vibeflow:onboarding-complete') === 'true') {
        setOnboardingDone(true)
      }
    }
    window.addEventListener('storage', handler)
    // Also poll briefly — storage event doesn't fire for same-tab writes
    const interval = setInterval(handler, 500)
    return () => {
      window.removeEventListener('storage', handler)
      clearInterval(interval)
    }
  }, [])

  if (!onboardingDone || isAuthenticated !== true) {
    return <Onboarding />
  }

  return (
    <div className="h-screen flex flex-col relative" style={{ background: 'var(--color-base)' }}>
      {/* macOS titlebar */}
      <div className="h-11 shrink-0 draggable relative flex items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
        {/* Logo */}
        <div className="absolute right-4 flex items-center gap-2 select-none">
          <div
            className="h-1.5 w-1.5 rounded-full animate-breathe"
            style={{ background: 'var(--color-accent)' }}
          />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: scaled(14),
              fontWeight: 600,
              letterSpacing: '0.25em',
              color: 'var(--color-text-dim)',
            }}
          >
            VIBΣ
          </span>
        </div>
      </div>

      {/* Horizontal navbar */}
      <div
        className="shrink-0 flex items-center gap-1 px-4 border-b"
        style={{ borderColor: 'var(--color-border)', height: '32px' }}
      >
        {NAV_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="no-drag label px-2.5 py-1.5 transition-colors relative"
            style={{
              fontSize: scaled(11),
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-dim)',
              borderBottom: activeTab === tab.id ? '1px solid var(--color-accent)' : '1px solid transparent',
              marginBottom: '-1px',
            }}
            onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--color-text-muted)' }}
            onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--color-text-dim)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div
        className="flex-1 min-h-0 p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr 250px',
          gridTemplateRows: '1fr auto',
          gap: '10px',
          gridTemplateAreas: `
            "left    center  sidebar"
            "cmd     cmd     cmd"
          `
        }}
      >
        {/* Left: Conversation + Swarm */}
        <div style={{ gridArea: 'left' }} className="flex flex-col gap-2.5 min-h-0 overflow-hidden">
          <div className="panel overflow-y-auto shrink-0 max-h-[38%]">
            <ConversationThread />
          </div>
          <div className="panel overflow-y-auto flex-1 min-h-0">
            <AgentSwarm />
          </div>
        </div>

        {/* Center: content based on active tab */}
        <div style={{ gridArea: 'center' }} className="min-h-0 overflow-hidden">
          {activeTab === 'stream' && <ActivityStream />}
          {activeTab === 'graph' && (
            <div className="panel glow-accent h-full overflow-hidden">
              <NeuralMap />
            </div>
          )}
          {activeTab === 'changes' && (
            <div className="panel h-full overflow-hidden">
              <FileChangeFeed />
            </div>
          )}
          {activeTab === 'server' && (
            <div className="panel h-full overflow-hidden">
              <DevServerPanel />
            </div>
          )}
          {activeTab === 'config' && (
            <div className="panel h-full overflow-hidden">
              <SettingsPanel />
            </div>
          )}
          {activeTab === 'profile' && (
            <div className="panel h-full overflow-hidden">
              <ProfileBuilder />
            </div>
          )}
        </div>

        {/* Right: Projects only */}
        <div style={{ gridArea: 'sidebar' }} className="panel overflow-hidden">
          <Sidebar />
        </div>

        {/* Bottom: Actions + Command */}
        <div style={{ gridArea: 'cmd' }} className="panel glow-cmd flex flex-col gap-2.5">
          <QuickActions />
          <CommandBar />
        </div>
      </div>
    </div>
  )
}

export default App

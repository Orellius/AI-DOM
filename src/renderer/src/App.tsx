import { useEffect, useState } from 'react'
import {
  Activity,
  GitGraph,
  FileCode2,
  Server,
  Settings,
  User as UserIcon,
  Sparkles,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  Sliders,
  FolderGit2,
  MonitorPlay,
} from 'lucide-react'
import { useAgentStore } from './stores/agentStore'
import { useAgentEvents } from './hooks/useAgentEvents'
import { scaled } from './utils/scale'
import { NeuralMap } from './components/NeuralMap'
import { ActivityStream } from './components/ActivityStream'
import { CommandBar } from './components/CommandBar'
import { QuickActions } from './components/QuickActions'
import { RightSidebar } from './components/RightSidebar'
import { Onboarding } from './components/Onboarding'
import { FileChangeFeed } from './components/FileChangeFeed'
import { DevServerPanel } from './components/DevServerPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ProfileBuilder } from './components/ProfileBuilder'
import { ChatPanel } from './components/ChatPanel'
import { PlanMode } from './components/PlanMode'
import { ModelOptimizer } from './components/ModelOptimizer'
import { GitModal } from './components/GitModal'
import { UmbrellaSync } from './components/UmbrellaSync'
import { LiveBrowser } from './components/LiveBrowser'
import { FileViewer } from './components/FileViewer'

const NAV_ITEMS = [
  { id: 'stream', label: 'Stream', icon: Activity },
  { id: 'graph', label: 'Graph', icon: GitGraph },
  { id: 'changes', label: 'Changes', icon: FileCode2 },
  { id: 'server', label: 'Server', icon: Server },
  { id: 'preview', label: 'Preview', icon: MonitorPlay },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'optimizer', label: 'Optimizer', icon: Sliders },
  { id: 'profile', label: 'Profile', icon: Sparkles },
] as const

type NavTab = (typeof NAV_ITEMS)[number]['id']

function App(): JSX.Element {
  useAgentEvents()

  const isAuthenticated = useAgentStore((s) => s.isAuthenticated)
  const uiScale = useAgentStore((s) => s.uiScale)
  const mode = useAgentStore((s) => s.mode)
  const toggleMode = useAgentStore((s) => s.toggleMode)
  const gitModal = useAgentStore((s) => s.gitModal)
  const activeProject = useAgentStore((s) => s.activeProject)
  const refreshGitStatus = useAgentStore((s) => s.refreshGitStatus)
  const previewUrl = useAgentStore((s) => s.previewUrl)
  const [activeTab, setActiveTab] = useState<NavTab>('stream')
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(() => localStorage.getItem('vibeflow:onboarding-complete') === 'true')

  // Apply UI scale on mount and when it changes
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale))
  }, [uiScale])

  // Shift+Tab to toggle mode
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        toggleMode()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleMode])

  useEffect(() => {
    window.api.checkAuth().then((result) => {
      useAgentStore.getState().handleEvent({
        type: 'auth:status',
        installed: result.installed,
        authenticated: result.authenticated
      })
    }).catch((err) => {
      console.error('[VIBE:App] checkAuth failed:', err)
    })
  }, [])

  // Restore last active project on startup
  useEffect(() => {
    window.api.getActiveProject().then((activePath) => {
      if (!activePath) return
      window.api.getProjects().then((projects) => {
        const match = projects.find((p) => p.path === activePath)
        if (match) {
          const store = useAgentStore.getState()
          store.setActiveProject(match)
          store.fetchProjectProfile()
          store.diagnoseActiveProject()
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [])

  // Poll git status every 10s (only when a project is active)
  useEffect(() => {
    if (!activeProject) return
    refreshGitStatus()
    const interval = setInterval(refreshGitStatus, 10_000)
    return () => clearInterval(interval)
  }, [refreshGitStatus, activeProject])

  // Listen for onboarding completion via storage event
  useEffect(() => {
    const handler = (): void => {
      if (localStorage.getItem('vibeflow:onboarding-complete') === 'true') {
        setOnboardingDone(true)
      }
    }
    window.addEventListener('storage', handler)
    const interval = setInterval(handler, 500)
    return () => {
      window.removeEventListener('storage', handler)
      clearInterval(interval)
    }
  }, [])

  if (!onboardingDone || isAuthenticated !== true) {
    return <Onboarding />
  }

  // Each tab renders full-width in the content area
  const renderTabContent = (): JSX.Element => {
    switch (activeTab) {
      case 'stream':
        return (
          <div className="flex gap-2.5 h-full min-h-0">
            {/* Center: Terminal, Chat, or Plan — expanded, takes most space */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {mode === 'plan' ? <PlanMode /> : mode === 'chat' ? <ChatPanel /> : <ActivityStream />}
            </div>
            {/* Right: Projects + Architect + Intents */}
            <div className="panel overflow-hidden" style={{ width: '260px', flexShrink: 0 }}>
              <RightSidebar />
            </div>
          </div>
        )
      case 'graph':
        return (
          <div className="panel glow-accent h-full overflow-hidden">
            <NeuralMap />
          </div>
        )
      case 'changes':
        return (
          <div className="panel h-full overflow-hidden">
            <FileChangeFeed />
          </div>
        )
      case 'server':
        return (
          <div className="panel h-full overflow-hidden">
            <DevServerPanel />
          </div>
        )
      case 'preview':
        return (
          <div className="panel h-full overflow-hidden">
            <LiveBrowser />
          </div>
        )
      case 'config':
        return (
          <div className="panel h-full overflow-hidden">
            <SettingsPanel />
          </div>
        )
      case 'optimizer':
        return (
          <div className="panel h-full overflow-hidden">
            <ModelOptimizer />
          </div>
        )
      case 'profile':
        return (
          <div className="panel h-full overflow-hidden">
            <ProfileBuilder />
          </div>
        )
    }
  }

  return (
    <div className="h-screen flex flex-col relative" style={{ background: 'var(--color-base)' }}>
      {gitModal && <GitModal />}
      {/* macOS titlebar */}
      <div className="h-11 shrink-0 draggable relative flex items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
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

      {/* Main layout: nav sidebar + full content */}
      <div className="flex-1 min-h-0 flex">
        {/* ── Vertical Nav Sidebar ── */}
        <div
          className="shrink-0 flex flex-col border-r"
          style={{
            width: navCollapsed ? '48px' : '160px',
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface)',
            transition: 'width 0.2s ease',
          }}
        >
          {/* Nav items */}
          <div className="flex-1 flex flex-col gap-0.5 py-2 px-1.5 overflow-hidden">
            {NAV_ITEMS.filter((item) => item.id !== 'preview' || previewUrl).map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="no-drag flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all w-full text-left"
                  style={{
                    background: isActive ? 'rgba(0, 232, 157, 0.06)' : 'transparent',
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-surface-light)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                  title={navCollapsed ? item.label : undefined}
                >
                  <Icon size={15} style={{ flexShrink: 0 }} />
                  {!navCollapsed && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(13),
                        fontWeight: isActive ? 500 : 400,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Bottom: User + Plan (greyed out) ── */}
          <div
            className="shrink-0 border-t px-1.5 py-2 flex flex-col gap-1.5"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {/* Subscription / Plan box */}
            <div
              className="rounded-lg px-2.5 py-2 flex items-center gap-2.5"
              style={{
                background: 'var(--color-surface-light)',
                border: '1px solid var(--color-border)',
                opacity: 0.4,
                cursor: 'not-allowed',
              }}
              title="Coming soon"
            >
              <CreditCard size={14} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
              {!navCollapsed && (
                <div className="min-w-0">
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: scaled(12),
                      color: 'var(--color-text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    Free Plan
                  </p>
                </div>
              )}
            </div>

            {/* User box */}
            <div
              className="rounded-lg px-2.5 py-2 flex items-center gap-2.5"
              style={{
                background: 'var(--color-surface-light)',
                border: '1px solid var(--color-border)',
                opacity: 0.4,
                cursor: 'not-allowed',
              }}
              title="Coming soon"
            >
              <div
                className="flex items-center justify-center rounded-full shrink-0"
                style={{
                  width: '22px',
                  height: '22px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border-light)',
                }}
              >
                <UserIcon size={12} style={{ color: 'var(--color-text-dim)' }} />
              </div>
              {!navCollapsed && (
                <div className="min-w-0">
                  <p
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: scaled(12),
                      color: 'var(--color-text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    User
                  </p>
                </div>
              )}
            </div>

            {/* Collapse toggle */}
            <button
              onClick={() => setNavCollapsed(!navCollapsed)}
              className="no-drag flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors w-full"
              style={{ color: 'var(--color-text-dim)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-light)'
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-dim)'
              }}
            >
              {navCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              {!navCollapsed && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12) }}>
                  Collapse
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Explorer Column (Projects) ── */}
        <div
          className="shrink-0 flex flex-col border-r overflow-hidden"
          style={{
            width: '220px',
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface)',
            padding: '10px 8px',
          }}
        >
          <UmbrellaSync />
        </div>

        {/* ── Full Content Area ── */}
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2.5">
          {activeProject ? (
            <>
              {/* Main content — full width, full height */}
              <div className="flex-1 min-h-0 overflow-hidden relative">
                {renderTabContent()}
                <FileViewer />
              </div>

              {/* Bottom: Actions + Command */}
              <div className="shrink-0 panel glow-cmd flex flex-col gap-2.5">
                <QuickActions />
                <CommandBar />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center" style={{ maxWidth: '320px' }}>
                <FolderGit2
                  size={32}
                  style={{ color: 'var(--color-text-dim)', margin: '0 auto 12px' }}
                />
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: scaled(16),
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Select a project to get started
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: scaled(12),
                    color: 'var(--color-text-dim)',
                    lineHeight: 1.5,
                  }}
                >
                  Add a project folder from the Explorer panel, or select an existing one.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  FolderGit2, FolderPlus, X, AlertTriangle,
  FileCode2, Braces, Cog, GitBranch, Play, Hammer, TestTube2, File,
  ChevronDown, Brain, FolderOpen, Trash2, RefreshCw,
} from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { FileExplorer } from './FileExplorer'

interface ProjectInfo {
  name: string
  path: string
  branch: string
  isInitialized: boolean
}

const LANG_ICONS: Record<string, typeof FileCode2> = {
  typescript: FileCode2,
  javascript: FileCode2,
  python: Braces,
  rust: Cog,
  go: File,
}

function ProjectSummaryCard(): JSX.Element | null {
  const diagnosis = useAgentStore((s) => s.projectDiagnosis)
  const gitStatus = useAgentStore((s) => s.gitStatus)
  const activeProject = useAgentStore((s) => s.activeProject)
  const addActivity = useAgentStore((s) => s.addActivity)

  if (!diagnosis || !activeProject) return null

  const { stack, git } = diagnosis
  const LangIcon = LANG_ICONS[stack.language] || File

  const actionPills: Array<{ label: string; cmd: string; icon: typeof Play }> = []
  if (stack.devCommand) actionPills.push({ label: 'Dev', cmd: stack.devCommand, icon: Play })
  if (stack.buildCommand) actionPills.push({ label: 'Build', cmd: stack.buildCommand, icon: Hammer })
  if (stack.testCommand) actionPills.push({ label: 'Test', cmd: stack.testCommand, icon: TestTube2 })

  const handleAction = (label: string, cmd: string): void => {
    if (label === 'Dev') {
      window.api.startDevServer(cmd).catch(() => {})
      addActivity({ type: 'system', content: `Starting: ${cmd}` })
    } else {
      const action = label.toLowerCase() as 'test'
      window.api.runQuickAction(action).then((result) => {
        addActivity({
          type: result.success ? 'system' : 'error',
          content: result.output || `${label} ${result.success ? 'succeeded' : 'failed'}`,
        })
      }).catch(() => {})
    }
  }

  // Use live gitStatus for counts (refreshed every 10s), diagnosis for stack/pulse
  const uncommitted = gitStatus.uncommittedCount
  const unpushed = gitStatus.unpushedCount

  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'rgba(0, 232, 157, 0.04)',
        borderRadius: '8px',
        border: '1px solid rgba(0, 232, 157, 0.1)',
      }}
    >
      {/* Project name */}
      <p
        className="truncate"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(13),
          fontWeight: 600,
          color: 'var(--color-accent)',
          marginBottom: '6px',
        }}
      >
        {activeProject.name}
      </p>

      {/* Stack row */}
      <div className="flex items-center gap-1.5" style={{ marginBottom: '4px' }}>
        <LangIcon size={11} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
        <p
          className="truncate"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(10),
            color: 'var(--color-text-dim)',
          }}
        >
          {stack.language}
          {stack.framework ? ` / ${stack.framework}` : ''}
          {stack.packageManager ? ` (${stack.packageManager})` : ''}
        </p>
      </div>

      {/* Git row */}
      {git.hasGit && (
        <div className="flex items-center gap-1.5" style={{ marginBottom: '6px' }}>
          <GitBranch size={11} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
          <p
            className="truncate"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(10),
              color: 'var(--color-text-dim)',
            }}
          >
            {git.branch || 'detached'}
          </p>
          {uncommitted > 0 && (
            <span
              style={{
                fontSize: scaled(9),
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-warning, #f0ad4e)',
                background: 'rgba(240, 173, 78, 0.12)',
                padding: '1px 5px',
                borderRadius: '4px',
                flexShrink: 0,
              }}
            >
              {uncommitted}m
            </span>
          )}
          {unpushed > 0 && (
            <span
              style={{
                fontSize: scaled(9),
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-info, #5bc0de)',
                background: 'rgba(91, 192, 222, 0.12)',
                padding: '1px 5px',
                borderRadius: '4px',
                flexShrink: 0,
              }}
            >
              {unpushed}p
            </span>
          )}
        </div>
      )}

      {/* Action pills */}
      {actionPills.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {actionPills.map(({ label, cmd, icon: Icon }) => (
            <button
              key={label}
              onClick={() => handleAction(label, cmd)}
              className="flex items-center gap-1 rounded transition-colors"
              style={{
                padding: '2px 8px',
                fontSize: scaled(9),
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-dim)',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 232, 157, 0.1)'
                e.currentTarget.style.color = 'var(--color-accent)'
                e.currentTarget.style.borderColor = 'rgba(0, 232, 157, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                e.currentTarget.style.color = 'var(--color-text-dim)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)'
              }}
              title={cmd}
            >
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface UmbrellaSyncProps {
  onOpenWorkspaceProfile?: () => void
}

export function UmbrellaSync({ onOpenWorkspaceProfile }: UmbrellaSyncProps = {}): JSX.Element {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [scaffoldingPath, setScaffoldingPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectInfo } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const activeProject = useAgentStore((s) => s.activeProject)
  const projectDiagnosis = useAgentStore((s) => s.projectDiagnosis)
  const switchProject = useAgentStore((s) => s.switchProject)
  const addActivity = useAgentStore((s) => s.addActivity)

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, project: ProjectInfo): void => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, project })
  }, [])

  const handleOpenInFinder = useCallback((): void => {
    if (!contextMenu) return
    window.api.showInFinder(contextMenu.project.path).catch(() => {})
    setContextMenu(null)
  }, [contextMenu])

  const handleContextRemove = useCallback(async (): Promise<void> => {
    if (!contextMenu) return
    const path = contextMenu.project.path
    setContextMenu(null)
    try {
      const result = await window.api.removeProject(path)
      if (result.success) {
        setProjects((prev) => prev.filter((p) => p.path !== path))
        if (activeProject?.path === path) {
          useAgentStore.getState().setActiveProject(null)
        }
      }
    } catch { /* ignore */ }
  }, [contextMenu, activeProject?.path])

  // Fetch project list on mount
  useEffect(() => {
    window.api.getProjects().then(setProjects).catch(() => {})
  }, [])

  const handleSwitch = useCallback(async (project: ProjectInfo): Promise<void> => {
    if (project.path === activeProject?.path || switching) return
    if (!project.isInitialized) {
      setScaffoldingPath(project.path)
      return
    }
    setSwitching(project.path)
    try {
      switchProject(project)
      addActivity({ type: 'system', content: `Switched to project: ${project.name}` })
    } finally {
      setSwitching(null)
    }
  }, [activeProject?.path, switching, switchProject, addActivity])

  const handleAddFolder = async (): Promise<void> => {
    try {
      const result = await window.api.addProject()
      if (result.success) {
        setProjects(result.projects)
      }
    } catch { /* ignore */ }
  }

  const handleRemove = async (e: React.MouseEvent, path: string): Promise<void> => {
    e.stopPropagation()
    try {
      const result = await window.api.removeProject(path)
      if (result.success) {
        setProjects((prev) => prev.filter((p) => p.path !== path))
        if (activeProject?.path === path) {
          useAgentStore.getState().setActiveProject(null)
        }
      }
    } catch { /* ignore */ }
  }

  const handleScaffold = async (path: string): Promise<void> => {
    try {
      const result = await window.api.scaffoldProject(path)
      // Also scaffold .vibe/ workspace identity files
      await window.api.scaffoldWorkspaceFiles().catch(() => {})
      if (result.success) {
        addActivity({ type: 'system', content: `Initialized: ${result.output} + .vibe/ workspace files` })
        // Refresh project list to pick up isInitialized change
        const updated = await window.api.getProjects()
        setProjects(updated)
        setScaffoldingPath(null)
        // Auto-switch to the now-initialized project
        const project = updated.find((p) => p.path === path)
        if (project) {
          switchProject(project)
          // Refresh file tree to show new .vibe/ folder
          setTimeout(() => useAgentStore.getState().refreshFileTree(), 300)
        }
      } else {
        addActivity({ type: 'error', content: `Scaffold failed: ${result.output}` })
      }
    } catch { /* ignore */ }
  }

  const showCard = activeProject && projectDiagnosis

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: scaled(12),
          fontWeight: 700,
          color: 'var(--color-text)',
          letterSpacing: '0.02em',
        }}>
          Explorer
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              useAgentStore.getState().refreshFileTree()
              // Also refresh project list
              window.api.getProjects().then(setProjects).catch(() => {})
            }}
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: '20px',
              height: '20px',
              color: 'var(--color-text-dim)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-light)'
              e.currentTarget.style.color = 'var(--color-accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-dim)'
            }}
            title="Refresh file tree"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleAddFolder}
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: '20px',
              height: '20px',
              color: 'var(--color-text-dim)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-light)'
              e.currentTarget.style.color = 'var(--color-accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-dim)'
            }}
            title="Add project folder"
          >
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      {/* Workspace Profile button */}
      {activeProject && onOpenWorkspaceProfile && (
        <button
          onClick={onOpenWorkspaceProfile}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 w-full text-left transition-all"
          style={{
            background: 'rgba(0, 232, 157, 0.04)',
            border: '1px solid rgba(0, 232, 157, 0.1)',
            marginBottom: '6px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 232, 157, 0.08)'
            e.currentTarget.style.borderColor = 'rgba(0, 232, 157, 0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 232, 157, 0.04)'
            e.currentTarget.style.borderColor = 'rgba(0, 232, 157, 0.1)'
          }}
        >
          <Brain size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-accent)',
              fontWeight: 500,
            }}
          >
            Workspace Profile
          </span>
        </button>
      )}

      {/* Summary Card */}
      {showCard && <ProjectSummaryCard />}

      {/* Divider */}
      {showCard && (
        <div
          style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.06)',
            margin: '8px 0',
          }}
        />
      )}

      {/* Project list */}
      <div style={{ maxHeight: '40%', overflowY: 'auto', flexShrink: 0 }}>
        {projects.length === 0 ? (
          <div style={{ padding: '8px 0' }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text-dim)',
              lineHeight: 1.5,
            }}>
              No projects yet — click + to add a folder
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 stagger-children">
            {projects.map((p) => {
              const isActive = p.path === activeProject?.path
              const isSwitching = p.path === switching
              const isHovered = p.path === hoveredPath
              const isScaffolding = p.path === scaffoldingPath

              return (
                <div key={p.path}>
                  <button
                    onClick={() => handleSwitch(p)}
                    onContextMenu={(e) => handleContextMenu(e, p)}
                    disabled={isActive || !!switching}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all w-full relative"
                    style={{
                      background: isActive ? 'rgba(0, 232, 157, 0.06)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(0, 232, 157, 0.15)' : 'transparent'}`,
                      cursor: isActive ? 'default' : 'pointer',
                      opacity: isSwitching ? 0.6 : (isActive ? 0.6 : 1),
                    }}
                    onMouseEnter={(e) => {
                      setHoveredPath(p.path)
                      if (!isActive) e.currentTarget.style.background = 'var(--color-surface-light)'
                    }}
                    onMouseLeave={(e) => {
                      setHoveredPath(null)
                      e.currentTarget.style.background = isActive ? 'rgba(0, 232, 157, 0.06)' : 'transparent'
                    }}
                  >
                    {p.isInitialized ? (
                      <FolderGit2
                        size={13}
                        style={{
                          color: isActive ? 'var(--color-accent)' : 'var(--color-text-dim)',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <AlertTriangle
                        size={13}
                        style={{
                          color: 'var(--color-warning, #f0ad4e)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: scaled(13),
                          color: isActive ? 'var(--color-accent)' : (p.isInitialized ? 'var(--color-text)' : 'var(--color-text-dim)'),
                          fontWeight: isActive ? 500 : 400,
                        }}
                      >
                        {p.name}
                      </p>
                      <p
                        className="truncate"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: scaled(11),
                          color: p.isInitialized ? 'var(--color-text-dim)' : 'var(--color-warning, #f0ad4e)',
                          marginTop: '1px',
                        }}
                      >
                        {p.isInitialized ? p.branch : 'Profile not found'}
                      </p>
                    </div>
                    {isActive && !isHovered && (
                      <span
                        className="dot animate-breathe"
                        style={{ width: '5px', height: '5px', background: 'var(--color-accent)', flexShrink: 0 }}
                      />
                    )}
                    {isHovered && (
                      <span
                        onClick={(e) => handleRemove(e, p.path)}
                        className="flex items-center justify-center rounded transition-colors"
                        style={{
                          width: '18px',
                          height: '18px',
                          color: 'var(--color-text-dim)',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-error, #ff5555)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-text-dim)'
                        }}
                        title="Remove project"
                      >
                        <X size={12} />
                      </span>
                    )}
                  </button>

                  {/* Inline scaffold prompt */}
                  {isScaffolding && (
                    <div
                      style={{
                        padding: '8px 10px',
                        margin: '4px 0 4px 8px',
                        background: 'rgba(240, 173, 78, 0.06)',
                        border: '1px solid rgba(240, 173, 78, 0.15)',
                        borderRadius: '6px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: scaled(10),
                          color: 'var(--color-text-dim)',
                          marginBottom: '6px',
                        }}
                      >
                        Initialize .vibe/ workspace identity
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleScaffold(p.path)}
                          className="rounded transition-colors"
                          style={{
                            padding: '3px 10px',
                            fontSize: scaled(10),
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-accent)',
                            background: 'rgba(0, 232, 157, 0.1)',
                            border: '1px solid rgba(0, 232, 157, 0.2)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 232, 157, 0.2)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 232, 157, 0.1)'
                          }}
                        >
                          Initialize
                        </button>
                        <button
                          onClick={() => setScaffoldingPath(null)}
                          className="rounded transition-colors"
                          style={{
                            padding: '3px 10px',
                            fontSize: scaled(10),
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-dim)',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Files section */}
      {activeProject && (
        <>
          <div
            style={{
              height: '1px',
              background: 'rgba(255, 255, 255, 0.06)',
              margin: '6px 0',
              flexShrink: 0,
            }}
          />
          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
            <FilesSection />
          </div>
        </>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 999,
            background: 'var(--color-surface-raised, #1e1e2e)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '4px',
            minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          }}
        >
          <button
            onClick={handleOpenInFinder}
            className="flex items-center gap-2 w-full text-left rounded-md transition-colors"
            style={{
              padding: '6px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <FolderOpen size={13} style={{ color: 'var(--color-text-dim)' }} />
            {navigator.platform.includes('Mac') ? 'Open in Finder' : 'Open in Explorer'}
          </button>
          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '2px 4px' }} />
          <button
            onClick={handleContextRemove}
            className="flex items-center gap-2 w-full text-left rounded-md transition-colors"
            style={{
              padding: '6px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-error, #ff5555)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 85, 85, 0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Trash2 size={13} />
            Remove from Workspace
          </button>
        </div>
      )}

    </div>
  )
}

function FilesSection(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 w-full text-left"
        style={{
          padding: '2px 0',
          fontSize: scaled(10),
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-dim)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <ChevronDown
          size={10}
          style={{
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        />
        Files
      </button>
      {!collapsed && (
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          <FileExplorer />
        </div>
      )}
    </div>
  )
}

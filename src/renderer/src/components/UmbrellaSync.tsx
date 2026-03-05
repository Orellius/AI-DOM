import { useEffect, useState, useCallback, useRef } from 'react'
import {
  FolderGit2, FolderPlus, AlertTriangle,
  GitBranch, Play, Hammer, TestTube2,
  ChevronDown, Brain, FolderOpen, Trash2, RefreshCw,
} from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { MultiRootFileTree } from './FileExplorer'

interface ProjectInfo {
  name: string
  path: string
  branch: string
  isInitialized: boolean
}

interface UmbrellaSyncProps {
  onOpenWorkspaceProfile?: () => void
}

export function UmbrellaSync({ onOpenWorkspaceProfile }: UmbrellaSyncProps = {}): JSX.Element {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const [scaffoldingPath, setScaffoldingPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectInfo } | null>(null)
  const [platform, setPlatform] = useState<string>('darwin')
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const activeProject = useAgentStore((s) => s.activeProject)
  const projectDiagnosis = useAgentStore((s) => s.projectDiagnosis)
  const switchProject = useAgentStore((s) => s.switchProject)
  const addActivity = useAgentStore((s) => s.addActivity)
  const collapsedRoots = useAgentStore((s) => s.collapsedRoots)
  const gitStatus = useAgentStore((s) => s.gitStatus)

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

  // Fetch project list and platform on mount, then load root trees
  useEffect(() => {
    Promise.all([
      window.api.getProjects(),
      window.api.getPlatform(),
    ]).then(([projs, plat]) => {
      setProjects(projs)
      setPlatform(plat)
      // Load file trees for all projects
      const { loadRootTree } = useAgentStore.getState()
      for (const p of projs) {
        loadRootTree(p.path)
      }
    }).catch(() => {})
  }, [])

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
        useAgentStore.getState().pruneRootTree(path)
        if (activeProject?.path === path) {
          useAgentStore.getState().setActiveProject(null)
        }
      }
    } catch { /* ignore */ }
  }, [contextMenu, activeProject?.path])

  const handleActivate = useCallback(async (project: ProjectInfo): Promise<void> => {
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
        // Load tree for newly added project
        const newProj = result.projects.find((p: ProjectInfo) =>
          !projects.some(existing => existing.path === p.path)
        )
        if (newProj) {
          useAgentStore.getState().loadRootTree(newProj.path)
          // Auto-activate if first project
          if (projects.length === 0 && newProj.isInitialized) {
            switchProject(newProj)
            addActivity({ type: 'system', content: `Switched to project: ${newProj.name}` })
          }
        }
      }
    } catch { /* ignore */ }
  }

  const handleScaffold = async (path: string): Promise<void> => {
    try {
      const result = await window.api.scaffoldProject(path)
      await window.api.scaffoldWorkspaceFiles().catch(() => {})
      if (result.success) {
        addActivity({ type: 'system', content: `Initialized: ${result.output} + .vibe/ workspace files` })
        const updated = await window.api.getProjects()
        setProjects(updated)
        setScaffoldingPath(null)
        const project = updated.find((p: ProjectInfo) => p.path === path)
        if (project) {
          switchProject(project)
          // Reload tree for newly scaffolded project
          setTimeout(() => {
            useAgentStore.getState().loadRootTree(path)
            useAgentStore.getState().refreshFileTree()
          }, 300)
        }
      } else {
        addActivity({ type: 'error', content: `Scaffold failed: ${result.output}` })
      }
    } catch { /* ignore */ }
  }

  const handleRefreshAll = useCallback((): void => {
    useAgentStore.getState().refreshAllRoots()
    useAgentStore.getState().refreshFileTree()
    window.api.getProjects().then(setProjects).catch(() => {})
  }, [])

  // Build action pills for active project from diagnosis
  const getActionPills = useCallback((): Array<{ label: string; cmd: string; icon: typeof Play }> => {
    if (!projectDiagnosis) return []
    const pills: Array<{ label: string; cmd: string; icon: typeof Play }> = []
    const { stack } = projectDiagnosis
    if (stack.devCommand) pills.push({ label: 'Dev', cmd: stack.devCommand, icon: Play })
    if (stack.buildCommand) pills.push({ label: 'Build', cmd: stack.buildCommand, icon: Hammer })
    if (stack.testCommand) pills.push({ label: 'Test', cmd: stack.testCommand, icon: TestTube2 })
    return pills
  }, [projectDiagnosis])

  const handleAction = useCallback((label: string, cmd: string): void => {
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
  }, [addActivity])

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
            onClick={handleRefreshAll}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: '20px', height: '20px', color: 'var(--color-text-dim)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-light)'
              e.currentTarget.style.color = 'var(--color-accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-dim)'
            }}
            title="Refresh all"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleAddFolder}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: '20px', height: '20px', color: 'var(--color-text-dim)' }}
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

      {/* Scrollable roots area */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {projects.length === 0 ? (
          <div style={{ padding: '16px 4px', textAlign: 'center' }}>
            <FolderPlus size={24} style={{ color: 'var(--color-text-dim)', margin: '0 auto 8px', opacity: 0.5 }} />
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text-dim)',
              lineHeight: 1.5,
            }}>
              No folders open
            </p>
            <button
              onClick={handleAddFolder}
              style={{
                marginTop: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: scaled(10),
                color: 'var(--color-accent)',
                background: 'rgba(0, 232, 157, 0.1)',
                border: '1px solid rgba(0, 232, 157, 0.2)',
                borderRadius: '4px',
                padding: '4px 12px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 232, 157, 0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 232, 157, 0.1)' }}
            >
              Open Folder
            </button>
          </div>
        ) : (
          projects.map((p) => {
            const isActive = p.path === activeProject?.path
            const isCollapsed = collapsedRoots.includes(p.path)
            const isSwitching = p.path === switching
            const isScaffolding = p.path === scaffoldingPath
            const actionPills = isActive ? getActionPills() : []
            const uncommitted = isActive ? gitStatus.uncommittedCount : 0
            const unpushed = isActive ? gitStatus.unpushedCount : 0

            return (
              <RootSection
                key={p.path}
                project={p}
                isActive={isActive}
                isCollapsed={isCollapsed}
                isSwitching={isSwitching}
                isScaffolding={isScaffolding}
                actionPills={actionPills}
                uncommitted={uncommitted}
                unpushed={unpushed}
                onToggleCollapse={() => useAgentStore.getState().toggleRootCollapse(p.path)}
                onActivate={() => handleActivate(p)}
                onContextMenu={(e) => handleContextMenu(e, p)}
                onAction={handleAction}
                onScaffold={() => handleScaffold(p.path)}
                onCancelScaffold={() => setScaffoldingPath(null)}
              />
            )
          })
        )}
      </div>

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
          {contextMenu.project.path !== activeProject?.path && contextMenu.project.isInitialized && (
            <>
              <button
                onClick={() => {
                  handleActivate(contextMenu.project)
                  setContextMenu(null)
                }}
                className="flex items-center gap-2 w-full text-left rounded-md transition-colors"
                style={{
                  padding: '6px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(11),
                  color: 'var(--color-accent)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 232, 157, 0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <FolderGit2 size={13} style={{ color: 'var(--color-accent)' }} />
                Set as Active
              </button>
              <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '2px 4px' }} />
            </>
          )}
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
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <FolderOpen size={13} style={{ color: 'var(--color-text-dim)' }} />
            {platform === 'darwin' ? 'Reveal in Finder' : 'Reveal in Explorer'}
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
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 85, 85, 0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Trash2 size={13} />
            Remove from Workspace
          </button>
        </div>
      )}
    </div>
  )
}

// --- Root Section (one per project) ---

interface RootSectionProps {
  project: ProjectInfo
  isActive: boolean
  isCollapsed: boolean
  isSwitching: boolean
  isScaffolding: boolean
  actionPills: Array<{ label: string; cmd: string; icon: typeof Play }>
  uncommitted: number
  unpushed: number
  onToggleCollapse: () => void
  onActivate: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onAction: (label: string, cmd: string) => void
  onScaffold: () => void
  onCancelScaffold: () => void
}

function RootSection({
  project, isActive, isCollapsed, isSwitching, isScaffolding,
  actionPills, uncommitted, unpushed,
  onToggleCollapse, onActivate, onContextMenu,
  onAction, onScaffold, onCancelScaffold,
}: RootSectionProps): JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <div style={{ marginBottom: '2px' }}>
      {/* Root header */}
      <div
        className="flex items-center gap-1.5 w-full"
        style={{
          padding: '4px 4px',
          borderRadius: '4px',
          cursor: 'pointer',
          opacity: isSwitching ? 0.6 : 1,
          background: isActive ? 'rgba(0, 232, 157, 0.04)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          setHovered(true)
          if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
        }}
        onMouseLeave={(e) => {
          setHovered(false)
          e.currentTarget.style.background = isActive ? 'rgba(0, 232, 157, 0.04)' : 'transparent'
        }}
        onContextMenu={(e) => onContextMenu(e)}
      >
        {/* Chevron — toggle collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
        >
          <ChevronDown
            size={12}
            style={{
              color: 'var(--color-text-dim)',
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>

        {/* Folder icon */}
        {project.isInitialized ? (
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

        {/* Project name — click to activate */}
        <button
          onClick={onActivate}
          className="truncate"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(12),
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--color-accent)' : (project.isInitialized ? 'var(--color-text)' : 'var(--color-text-dim)'),
            background: 'none',
            border: 'none',
            cursor: isActive ? 'default' : 'pointer',
            padding: 0,
            textAlign: 'left',
            minWidth: 0,
            flex: 1,
          }}
          title={`${project.path}${project.isInitialized ? '' : ' (not initialized)'}`}
        >
          {project.name}
        </button>

        {/* Branch badge */}
        {project.isInitialized && project.branch && (
          <span
            className="truncate"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(9),
              color: 'var(--color-text-dim)',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '1px 5px',
              borderRadius: '3px',
              maxWidth: '80px',
              flexShrink: 0,
            }}
          >
            <GitBranch size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
            {project.branch}
          </span>
        )}

        {/* Git status badges (active project only) */}
        {isActive && uncommitted > 0 && (
          <span style={{
            fontSize: scaled(9), fontFamily: 'var(--font-mono)',
            color: 'var(--color-warning, #f0ad4e)', background: 'rgba(240, 173, 78, 0.12)',
            padding: '1px 5px', borderRadius: '4px', flexShrink: 0,
          }}>
            {uncommitted}m
          </span>
        )}
        {isActive && unpushed > 0 && (
          <span style={{
            fontSize: scaled(9), fontFamily: 'var(--font-mono)',
            color: 'var(--color-info, #5bc0de)', background: 'rgba(91, 192, 222, 0.12)',
            padding: '1px 5px', borderRadius: '4px', flexShrink: 0,
          }}>
            {unpushed}p
          </span>
        )}

        {/* Active dot */}
        {isActive && !hovered && (
          <span
            className="dot animate-breathe"
            style={{ width: '5px', height: '5px', background: 'var(--color-accent)', flexShrink: 0, borderRadius: '50%' }}
          />
        )}
      </div>

      {/* Action pills on hover (active project only) */}
      {isActive && hovered && actionPills.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap" style={{ padding: '2px 0 2px 24px' }}>
          {actionPills.map(({ label, cmd, icon: Icon }) => (
            <button
              key={label}
              onClick={(e) => { e.stopPropagation(); onAction(label, cmd) }}
              className="flex items-center gap-1 rounded transition-colors"
              style={{
                padding: '1px 6px',
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
              <Icon size={9} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Inline scaffold prompt for uninitialized projects */}
      {isScaffolding && (
        <div
          style={{
            padding: '6px 10px',
            margin: '2px 0 2px 20px',
            background: 'rgba(240, 173, 78, 0.06)',
            border: '1px solid rgba(240, 173, 78, 0.15)',
            borderRadius: '6px',
          }}
        >
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(10),
            color: 'var(--color-text-dim)',
            marginBottom: '6px',
          }}>
            Initialize .vibe/ workspace identity
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onScaffold}
              className="rounded transition-colors"
              style={{
                padding: '3px 10px', fontSize: scaled(10),
                fontFamily: 'var(--font-mono)', color: 'var(--color-accent)',
                background: 'rgba(0, 232, 157, 0.1)',
                border: '1px solid rgba(0, 232, 157, 0.2)', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 232, 157, 0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 232, 157, 0.1)' }}
            >
              Initialize
            </button>
            <button
              onClick={onCancelScaffold}
              className="rounded transition-colors"
              style={{
                padding: '3px 10px', fontSize: scaled(10),
                fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.06)', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline file tree (expanded) */}
      {!isCollapsed && project.isInitialized && (
        <MultiRootFileTree projectPath={project.path} isActive={isActive} />
      )}
    </div>
  )
}

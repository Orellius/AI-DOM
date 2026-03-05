import { useEffect, useState } from 'react'
import { FolderGit2, FolderPlus, X } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

interface ProjectInfo {
  name: string
  path: string
  branch: string
}

export function UmbrellaSync(): JSX.Element {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const activeProject = useAgentStore((s) => s.activeProject)
  const switchProject = useAgentStore((s) => s.switchProject)
  const addActivity = useAgentStore((s) => s.addActivity)

  // Fetch project list on mount
  useEffect(() => {
    window.api.getProjects().then(setProjects).catch(() => {})
  }, [])

  const handleSwitch = async (project: ProjectInfo): Promise<void> => {
    if (project.path === activeProject?.path || switching) return
    setSwitching(project.path)
    try {
      switchProject(project)
      addActivity({ type: 'system', content: `Switched to project: ${project.name}` })
    } finally {
      setSwitching(null)
    }
  }

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
        // If we removed the active project, clear it in store
        if (activeProject?.path === path) {
          useAgentStore.getState().setActiveProject(null)
        }
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <p className="label" style={{ fontSize: scaled(10) }}>Explorer</p>
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
      <div className="flex-1 overflow-y-auto">
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
              return (
                <button
                  key={p.path}
                  onClick={() => handleSwitch(p)}
                  disabled={isActive || !!switching}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all w-full relative"
                  style={{
                    background: isActive ? 'rgba(0, 232, 157, 0.06)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(0, 232, 157, 0.15)' : 'transparent'}`,
                    cursor: isActive ? 'default' : 'pointer',
                    opacity: isSwitching ? 0.6 : 1,
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
                  <FolderGit2
                    size={13}
                    style={{
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-dim)',
                      flexShrink: 0,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(13),
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
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
                        color: 'var(--color-text-dim)',
                        marginTop: '1px',
                      }}
                    >
                      {p.branch}
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

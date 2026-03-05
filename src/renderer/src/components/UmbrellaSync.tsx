import { useEffect, useState } from 'react'
import { FolderGit2 } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

interface ProjectInfo {
  name: string
  branch: string
}

export function UmbrellaSync(): JSX.Element {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const addActivity = useAgentStore((s) => s.addActivity)

  useEffect(() => {
    window.api.getProjects().then((p) => {
      setProjects(p)
      window.api.getActiveProject().then((name) => setActiveProject(name)).catch(() => {})
    }).catch(() => {})
  }, [])

  const handleSwitch = async (projectName: string) => {
    if (projectName === activeProject || switching) return
    setSwitching(projectName)
    try {
      const result = await window.api.switchProject(projectName)
      if (result.success) {
        setActiveProject(projectName)
        addActivity({ type: 'system', content: `Switched to project: ${projectName}` })
      }
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <p className="label mb-3">Projects</p>
      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
            No projects found
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 stagger-children">
            {projects.map((p) => {
              const isActive = p.name === activeProject
              const isSwitching = p.name === switching
              return (
                <button
                  key={p.name}
                  onClick={() => handleSwitch(p.name)}
                  disabled={isActive || !!switching}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all w-full group"
                  style={{
                    background: isActive ? 'rgba(0, 232, 157, 0.06)' : 'var(--color-surface-light)',
                    border: `1px solid ${isActive ? 'rgba(0, 232, 157, 0.15)' : 'var(--color-border)'}`,
                    cursor: isActive ? 'default' : 'pointer',
                    opacity: isSwitching ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border-light)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border)'
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
                        fontSize: scaled(14),
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
                        fontSize: scaled(12),
                        color: 'var(--color-text-dim)',
                        marginTop: '1px',
                      }}
                    >
                      {p.branch}
                    </p>
                  </div>
                  {isActive && (
                    <span
                      className="dot animate-breathe"
                      style={{ width: '5px', height: '5px', background: 'var(--color-accent)', flexShrink: 0 }}
                    />
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

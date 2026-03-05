import { useState, useEffect, useCallback } from 'react'
import { Save, X, Download, FileText } from 'lucide-react'
import { scaled } from '../utils/scale'

const WORKSPACE_FILES = [
  'SOUL.md',
  'USER.md',
  'IDENTITY.md',
  'TOOLS.md',
  'AGENTS.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
] as const

const FILE_DESCRIPTIONS: Record<string, string> = {
  'SOUL.md': 'Personality & philosophy',
  'USER.md': 'Your preferences',
  'IDENTITY.md': 'Project identity & stack',
  'TOOLS.md': 'Commands & conventions',
  'AGENTS.md': 'Agent behavior rules',
  'HEARTBEAT.md': 'Session state & progress',
  'BOOTSTRAP.md': 'First-run & onboarding',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function WorkspaceProfile(): JSX.Element {
  const [files, setFiles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const loadFiles = useCallback(async () => {
    try {
      const result = await window.api.getWorkspaceFiles()
      setFiles(result)
      setInitialized(Object.keys(result).length > 0)
    } catch {
      // .vibe/ doesn't exist yet
      setInitialized(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleInitialize = async (): Promise<void> => {
    try {
      await window.api.scaffoldWorkspaceFiles()
      await loadFiles()
    } catch { /* ignore */ }
  }

  const handleCardClick = (fileName: string): void => {
    if (editing === fileName) {
      setEditing(null)
      return
    }
    setEditing(fileName)
    setEditContent(files[fileName] || '')
  }

  const handleSave = async (): Promise<void> => {
    if (!editing) return
    setSaving(true)
    try {
      await window.api.writeWorkspaceFile(editing, editContent)
      setFiles((prev) => ({ ...prev, [editing]: editContent }))
      setEditing(null)
    } catch { /* ignore */ }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)' }}>
          Loading workspace files...
        </p>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileText size={32} style={{ color: 'var(--color-text-dim)' }} />
        <p style={{ fontFamily: 'var(--font-display)', fontSize: scaled(16), fontWeight: 600, color: 'var(--color-text-muted)' }}>
          No workspace files found
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)', textAlign: 'center', maxWidth: '300px', lineHeight: 1.5 }}>
          Initialize .vibe/ to give this project its own identity, rules, and context for AI agents.
        </p>
        <button onClick={handleInitialize} className="btn btn-accent" style={{ fontSize: scaled(13) }}>
          <Download size={14} />
          Initialize Workspace Files
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '4px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: scaled(15), fontWeight: 600, color: 'var(--color-text)' }}>
          Workspace Files
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(11), color: 'var(--color-text-dim)', marginTop: '2px' }}>
          .vibe/ — project identity for AI agents
        </p>
      </div>

      {/* Card grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '8px',
          marginBottom: editing ? '12px' : '0',
        }}
      >
        {WORKSPACE_FILES.map((fileName) => {
          const content = files[fileName] || ''
          const size = new TextEncoder().encode(content).length
          const isActive = editing === fileName
          return (
            <button
              key={fileName}
              onClick={() => handleCardClick(fileName)}
              className="text-left rounded-lg transition-all"
              style={{
                padding: '10px 12px',
                background: isActive ? 'rgba(0, 232, 157, 0.08)' : 'var(--color-surface-light)',
                border: `1px solid ${isActive ? 'rgba(0, 232, 157, 0.25)' : 'var(--color-border)'}`,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--color-border-light)'
                  e.currentTarget.style.background = 'var(--color-surface-raised)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.background = 'var(--color-surface-light)'
                }
              }}
            >
              <p
                className="truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(12),
                  fontWeight: 600,
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
                  marginBottom: '2px',
                }}
              >
                {fileName.replace('.md', '')}
              </p>
              <p
                className="truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(9),
                  color: 'var(--color-text-dim)',
                }}
              >
                {FILE_DESCRIPTIONS[fileName]}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(9),
                  color: 'var(--color-text-dim)',
                  marginTop: '4px',
                }}
              >
                {formatSize(size)}
              </p>
            </button>
          )
        })}
      </div>

      {/* Inline editor */}
      {editing && (
        <div
          className="flex-1 flex flex-col animate-slide-up"
          style={{
            background: 'var(--color-surface-light)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            overflow: 'hidden',
            minHeight: '200px',
          }}
        >
          {/* Editor header */}
          <div
            className="flex items-center justify-between shrink-0"
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), fontWeight: 600, color: 'var(--color-accent)' }}>
              {editing}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-accent"
                style={{ padding: '4px 10px', fontSize: scaled(11) }}
              >
                <Save size={12} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="btn"
                style={{ padding: '4px 8px', fontSize: scaled(11) }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="flex-1"
            style={{
              background: 'var(--color-base)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              lineHeight: 1.6,
              padding: '12px',
              border: 'none',
              outline: 'none',
              resize: 'none',
              minHeight: '180px',
            }}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}

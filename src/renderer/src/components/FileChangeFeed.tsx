import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

export function FileChangeFeed(): JSX.Element {
  const fileChanges = useAgentStore((s) => s.fileChanges)
  const refreshFileChanges = useAgentStore((s) => s.refreshFileChanges)

  useEffect(() => {
    refreshFileChanges()
  }, [refreshFileChanges])

  const badge = (type: 'created' | 'modified' | 'deleted') => {
    const map = {
      created: { char: '+', color: 'var(--color-accent)', bg: 'rgba(0, 232, 157, 0.08)', border: 'rgba(0, 232, 157, 0.15)' },
      modified: { char: '~', color: 'var(--color-amber)', bg: 'rgba(255, 176, 32, 0.08)', border: 'rgba(255, 176, 32, 0.15)' },
      deleted: { char: '-', color: 'var(--color-red)', bg: 'rgba(255, 64, 96, 0.08)', border: 'rgba(255, 64, 96, 0.15)' }
    }
    const s = map[type]
    return (
      <span
        className="inline-flex items-center justify-center rounded"
        style={{
          width: '18px',
          height: '18px',
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(13),
          fontWeight: 600,
          color: s.color,
          background: s.bg,
          border: `1px solid ${s.border}`,
        }}
      >
        {s.char}
      </span>
    )
  }

  const filename = (path: string) => path.split('/').pop() ?? path

  return (
    <div className="flex flex-col h-full">
      <div className="mb-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
        <span className="label">Changes</span>
        <button
          onClick={refreshFileChanges}
          className="rounded p-1 transition-colors"
          style={{ color: 'var(--color-text-dim)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-muted)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
          title="Refresh"
        >
          <RotateCw size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {fileChanges.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
              No changes yet
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 stagger-children">
            {fileChanges.map((change, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-light)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {badge(change.type)}
                <span
                  className="truncate"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text)' }}
                  title={change.path}
                >
                  {filename(change.path)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

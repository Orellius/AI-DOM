import { useAgentStore } from '../stores/agentStore'
import type { ConversationEntry } from '../stores/agentStore'
import { scaled } from '../utils/scale'

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

function statusClass(status: ConversationEntry['status']): string {
  switch (status) {
    case 'thinking': return 'dot dot-thinking'
    case 'running': return 'dot dot-running'
    case 'completed': return 'dot dot-completed'
    case 'failed': return 'dot dot-failed'
  }
}

export function ConversationThread(): JSX.Element {
  const conversationHistory = useAgentStore((s) => s.conversationHistory)

  if (conversationHistory.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), color: 'var(--color-text-dim)' }}>
          No intents yet
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 stagger-children">
      {conversationHistory.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg px-3 py-2 transition-colors"
          style={{
            background: 'var(--color-surface-light)',
            border: '1px solid var(--color-border)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-border-light)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
        >
          <div className="flex items-start justify-between gap-2">
            <p
              className="line-clamp-2 flex-1"
              style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text)', lineHeight: '1.4' }}
            >
              {entry.intent}
            </p>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)', flexShrink: 0 }}>
              {relativeTime(entry.timestamp)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={statusClass(entry.status)} />
            <span className="label" style={{ fontSize: scaled(11) }}>{entry.status}</span>
            {entry.taskCount > 0 && (
              <span
                className="ml-auto"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(12),
                  color: 'var(--color-text-dim)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {entry.taskCount}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

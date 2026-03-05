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

function statusDotClass(status: ConversationEntry['status']): string {
  switch (status) {
    case 'thinking': return 'dot-thinking'
    case 'running': return 'dot-running'
    case 'completed': return 'dot-completed'
    case 'failed': return 'dot-failed'
  }
}

export function IntentHistory(): JSX.Element {
  const conversationHistory = useAgentStore((s) => s.conversationHistory)

  if (conversationHistory.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)' }}>
          No intents yet
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {conversationHistory.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-default"
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-light)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span
            className={`${statusDotClass(entry.status)}`}
            style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 }}
          />
          <span
            className="truncate flex-1"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              color: 'var(--color-text)',
              lineHeight: '1.4',
            }}
          >
            {entry.intent}
          </span>
          <span
            className="shrink-0"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text-dim)',
            }}
          >
            {relativeTime(entry.timestamp)}
          </span>
        </div>
      ))}
    </div>
  )
}

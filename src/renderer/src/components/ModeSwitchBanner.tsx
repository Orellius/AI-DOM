import { Zap, X } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

export function ModeSwitchBanner(): JSX.Element | null {
  const prompt = useAgentStore((s) => s.modeSwitchPrompt)
  const accept = useAgentStore((s) => s.acceptModeSwitchPrompt)
  const dismiss = useAgentStore((s) => s.dismissModeSwitchPrompt)

  if (!prompt.visible) return null

  const label = prompt.direction === 'to-terminal'
    ? 'This sounds like a build task'
    : 'This sounds like a conversation'
  const action = prompt.direction === 'to-terminal'
    ? 'Switch to Terminal'
    : 'Switch to Chat'

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg animate-slide-up shrink-0"
      style={{
        background: 'rgba(0, 232, 157, 0.04)',
        border: '1px solid rgba(0, 232, 157, 0.12)',
      }}
    >
      <Zap size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      <span
        className="flex-1"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(12),
          color: 'var(--color-text-muted)',
        }}
      >
        {label}
      </span>
      <button
        onClick={accept}
        className="btn-accent"
        style={{
          padding: '3px 10px',
          borderRadius: '6px',
          fontSize: scaled(12),
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          border: '1px solid rgba(0, 232, 157, 0.2)',
          background: 'rgba(0, 232, 157, 0.08)',
          color: 'var(--color-accent)',
          cursor: 'pointer',
        }}
      >
        {action}
      </button>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-dim)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}

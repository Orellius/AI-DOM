import { useEffect, useRef } from 'react'
import { Wrench, FileText, AlertCircle, Zap } from 'lucide-react'
import { useAgentStore, ActivityEntry } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { ModeSwitchBanner } from './ModeSwitchBanner'
import { PlanBubble } from './PlanBubble'
import { PlanPanel } from './PlanPanel'
import { AtomicConfirmOverlay } from './AtomicConfirmButton'

function formatTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  const d = new Date(timestamp)
  return d.toTimeString().slice(0, 5)
}

function EntryIcon({ type }: { type: ActivityEntry['type'] }): JSX.Element {
  const size = 12
  switch (type) {
    case 'tool_call':
      return <Wrench size={size} />
    case 'file_change':
      return <FileText size={size} />
    case 'error':
      return <AlertCircle size={size} />
    default:
      return <Zap size={size} />
  }
}

const typeStyles: Record<ActivityEntry['type'], { text: string; icon: string; bg: string }> = {
  system: { text: 'color: var(--color-text-dim)', icon: 'var(--color-text-dim)', bg: 'transparent' },
  text: { text: 'color: var(--color-text)', icon: 'var(--color-text-muted)', bg: 'transparent' },
  tool_call: { text: 'color: var(--color-cyan)', icon: 'var(--color-cyan)', bg: 'rgba(0, 212, 255, 0.03)' },
  file_change: { text: 'color: var(--color-accent)', icon: 'var(--color-accent)', bg: 'rgba(0, 232, 157, 0.03)' },
  error: { text: 'color: var(--color-red)', icon: 'var(--color-red)', bg: 'rgba(255, 64, 96, 0.04)' },
}

export function ActivityStream(): JSX.Element {
  const activityLog = useAgentStore((s) => s.activityLog)
  const retryTask = useAgentStore((s) => s.retryTask)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activityLog.length])

  return (
    <div className="activity-stream flex flex-col h-full overflow-hidden" style={{ position: 'relative' }}>
      {/* Plan viewport */}
      <PlanBubble />
      <PlanPanel />
      {/* Mode switch banner */}
      <ModeSwitchBanner />
      {/* Dangerous command overlay */}
      <AtomicConfirmOverlay />
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="h-1 w-1 rounded-full"
          style={{
            background: activityLog.length > 0 ? 'var(--color-accent)' : 'var(--color-text-dim)',
            boxShadow: activityLog.length > 0 ? '0 0 6px var(--color-accent)' : 'none'
          }}
        />
        <span className="label">Stream</span>
        <span
          className="ml-auto"
          style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)' }}
        >
          {activityLog.length}
        </span>
      </div>

      {/* Log */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {activityLog.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(14), color: 'var(--color-text-dim)' }}>
                Waiting for intent...
              </p>
            </div>
          </div>
        ) : (
          activityLog.map((entry) => {
            const style = typeStyles[entry.type]
            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 px-3 py-1.5 mx-1 rounded-md transition-colors"
                style={{
                  background: style.bg,
                  fontFamily: 'var(--font-mono)',
                  fontSize: scaled(14),
                  lineHeight: '1.5',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-light)'}
                onMouseLeave={(e) => e.currentTarget.style.background = style.bg}
              >
                {/* Time */}
                <span
                  className="shrink-0 mt-0.5"
                  style={{ fontSize: scaled(12), color: 'var(--color-text-dim)', minWidth: '24px' }}
                >
                  {formatTime(entry.timestamp)}
                </span>

                {/* Icon */}
                {entry.type !== 'system' && (
                  <span className="shrink-0 mt-0.5" style={{ color: style.icon }}>
                    <EntryIcon type={entry.type} />
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {entry.type === 'tool_call' && entry.tool && (
                      <span
                        className="chip-active"
                        style={{
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: scaled(12),
                          fontWeight: 500,
                          border: '1px solid rgba(0, 212, 255, 0.15)',
                          background: 'rgba(0, 212, 255, 0.06)',
                          color: 'var(--color-cyan)',
                        }}
                      >
                        {entry.tool}
                      </span>
                    )}
                    {entry.taskId && (
                      <span
                        style={{
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontSize: scaled(11),
                          background: 'var(--color-surface-light)',
                          color: 'var(--color-text-dim)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        {entry.taskId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <div
                    className="break-words whitespace-pre-wrap mt-0.5"
                    style={{ cssText: style.text }}
                  >
                    {entry.content}
                  </div>

                  {entry.type === 'error' && entry.taskId && (
                    <button
                      onClick={() => retryTask(entry.taskId!)}
                      className="btn-danger mt-1.5"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: scaled(12),
                        border: '1px solid rgba(255, 64, 96, 0.2)',
                        background: 'rgba(255, 64, 96, 0.06)',
                        color: 'var(--color-red)',
                        cursor: 'pointer',
                      }}
                    >
                      retry
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

import { X, Circle, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import type { AgentTask } from '../stores/agentStore'
import { scaled } from '../utils/scale'

const TYPE_COLORS: Record<AgentTask['type'], string> = {
  code: 'var(--color-cyan)',
  research: 'var(--color-amber)',
  test: 'var(--color-accent)',
  deploy: 'var(--color-red)',
}

function StatusIcon({ status }: { status: AgentTask['status'] }): JSX.Element {
  switch (status) {
    case 'pending':
      return <Circle size={12} style={{ color: 'var(--color-text-dim)' }} />
    case 'running':
      return <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
    case 'completed':
      return <CheckCircle2 size={12} style={{ color: 'var(--color-accent)' }} />
    case 'failed':
      return <AlertCircle size={12} style={{ color: 'var(--color-red)' }} />
  }
}

export function PlanPanel(): JSX.Element | null {
  const tasks = useAgentStore((s) => s.tasks)
  const planExpanded = useAgentStore((s) => s.planExpanded)
  const togglePlanViewport = useAgentStore((s) => s.togglePlanViewport)
  const intentPendingApproval = useAgentStore((s) => s.intentPendingApproval)
  const approveIntent = useAgentStore((s) => s.approveIntent)
  const rejectIntent = useAgentStore((s) => s.rejectIntent)

  const taskList = Object.values(tasks)
  if (taskList.length === 0 || !planExpanded) return null

  const completed = taskList.filter((t) => t.status === 'completed').length

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-20 flex flex-col animate-slide-in-right"
      style={{
        width: '320px',
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        borderRadius: '0 12px 12px 0',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="label">Plan</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(11),
              color: 'var(--color-text-dim)',
            }}
          >
            {completed}/{taskList.length}
          </span>
        </div>
        <button
          onClick={togglePlanViewport}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-dim)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-muted)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
        >
          <X size={14} />
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-1">
          {taskList.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-light)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span className="mt-0.5 shrink-0">
                <StatusIcon status={task.status} />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="break-words"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: scaled(12),
                    color: task.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-text)',
                    lineHeight: '1.4',
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                    textDecorationColor: 'var(--color-text-dim)',
                  }}
                >
                  {task.description}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {/* Type badge */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: scaled(10),
                      fontWeight: 500,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: TYPE_COLORS[task.type],
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: `color-mix(in srgb, ${TYPE_COLORS[task.type]} 8%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${TYPE_COLORS[task.type]} 15%, transparent)`,
                    }}
                  >
                    {task.type}
                  </span>
                  {/* Dependencies */}
                  {task.dependencies.length > 0 && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: scaled(10),
                        color: 'var(--color-text-dim)',
                      }}
                    >
                      needs {task.dependencies.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approval buttons */}
      {intentPendingApproval && (
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <button
            onClick={approveIntent}
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--color-accent)',
              color: 'var(--color-base)',
              cursor: 'pointer',
            }}
          >
            Run
          </button>
          <button
            onClick={rejectIntent}
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(12),
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-dim)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

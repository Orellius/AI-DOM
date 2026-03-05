import { Brain, Cpu, CheckCircle2 } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

export function AgentSwarm(): JSX.Element {
  const tasks = useAgentStore((s) => s.tasks)
  const architectStatus = useAgentStore((s) => s.architectStatus)

  const taskList = Object.values(tasks)
  const running = taskList.filter((t) => t.status === 'running')
  const completedCount = taskList.filter((t) => t.status === 'completed').length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Architect */}
      <div className="pb-3 mb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: 'var(--color-text-muted)' }} />
          <span className="label">Architect</span>
          <span
            className={`ml-auto dot ${
              architectStatus === 'thinking'
                ? 'dot-thinking'
                : architectStatus === 'done'
                  ? 'dot-completed'
                  : 'dot-idle'
            }`}
          />
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)', marginTop: '4px' }}>
          {architectStatus === 'idle'
            ? 'Awaiting intent'
            : architectStatus === 'thinking'
              ? 'Decomposing...'
              : 'Plan ready'}
        </p>
      </div>

      {/* Workers */}
      <div className="flex-1 overflow-y-auto">
        <p className="label mb-2">Workers</p>
        {running.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-dim)' }}>
            No active workers
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 stagger-children">
            {running.map((task) => (
              <div
                key={task.id}
                className="rounded-lg p-2.5"
                style={{
                  background: 'var(--color-surface-light)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-start gap-2">
                  <Cpu size={12} style={{ color: 'var(--color-text-muted)', marginTop: '2px', flexShrink: 0 }} />
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), lineHeight: '1.4', color: 'var(--color-text)' }}>
                    {task.description}
                  </p>
                </div>
                {task.toolInUse && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="dot dot-running" style={{ width: '4px', height: '4px' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-cyan)' }}>
                      {task.toolInUse}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Counter */}
      {taskList.length > 0 && (
        <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={12} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'var(--color-text-muted)' }}>
              {completedCount}/{taskList.length}
            </span>
            {/* Progress bar */}
            <div className="flex-1 h-1 rounded-full ml-1" style={{ background: 'var(--color-surface-light)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(completedCount / taskList.length) * 100}%`,
                  background: 'var(--color-accent)',
                  boxShadow: '0 0 6px var(--color-accent)',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

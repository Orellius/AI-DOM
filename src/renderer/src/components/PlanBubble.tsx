import { ListChecks } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

export function PlanBubble(): JSX.Element | null {
  const tasks = useAgentStore((s) => s.tasks)
  const planExpanded = useAgentStore((s) => s.planExpanded)
  const togglePlanViewport = useAgentStore((s) => s.togglePlanViewport)

  const taskList = Object.values(tasks)
  if (taskList.length === 0 || planExpanded) return null

  const completed = taskList.filter((t) => t.status === 'completed').length
  const total = taskList.length
  const progress = (completed / total) * 100

  return (
    <button
      onClick={togglePlanViewport}
      className="absolute top-12 right-3 z-10 flex items-center gap-2 rounded-full px-3 py-1.5 transition-all animate-slide-up"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid rgba(0, 232, 157, 0.15)',
        cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0, 232, 157, 0.3)'
        e.currentTarget.style.boxShadow = '0 2px 16px rgba(0, 232, 157, 0.08)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0, 232, 157, 0.15)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.3)'
      }}
    >
      <ListChecks size={13} style={{ color: 'var(--color-accent)' }} />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(12),
          fontWeight: 500,
          color: 'var(--color-text)',
        }}
      >
        {completed}/{total}
      </span>
      {/* Mini progress bar */}
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: '40px',
          height: '4px',
          background: 'var(--color-surface-light)',
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: 'var(--color-accent)',
            boxShadow: '0 0 4px var(--color-accent)',
          }}
        />
      </div>
    </button>
  )
}

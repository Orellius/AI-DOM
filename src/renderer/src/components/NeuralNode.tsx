import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Code2, Search, FlaskConical, Rocket, Box } from 'lucide-react'
import { scaled } from '../utils/scale'

const typeIcons: Record<string, typeof Code2> = {
  code: Code2,
  research: Search,
  test: FlaskConical,
  deploy: Rocket,
  generic: Box
}

const statusStyles: Record<string, { border: string; dot: string; glow?: string }> = {
  pending: { border: 'var(--color-border)', dot: 'var(--color-text-dim)' },
  running: { border: 'var(--color-accent-dim)', dot: 'var(--color-accent)', glow: '0 0 12px -4px var(--color-accent)' },
  completed: { border: 'var(--color-accent-dim)', dot: 'var(--color-accent)' },
  failed: { border: 'var(--color-red)', dot: 'var(--color-red)' }
}

export function NeuralNode({ data }: NodeProps): JSX.Element {
  const taskType = (data.taskType as string) ?? 'generic'
  const status = (data.status as string) ?? 'pending'
  const toolInUse = data.toolInUse as string | undefined
  const description = data.description as string

  const Icon = typeIcons[taskType] ?? Box
  const style = statusStyles[status] ?? statusStyles.pending

  return (
    <div
      className="min-w-[180px] max-w-[220px] rounded-lg p-3"
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${style.border}`,
        boxShadow: style.glow || 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--color-border)' }} />

      <div className="flex items-start gap-2">
        <Icon size={14} style={{ color: 'var(--color-text-muted)', marginTop: '1px', flexShrink: 0 }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), lineHeight: '1.4', color: 'var(--color-text)' }}>
          {description}
        </p>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={status === 'running' ? 'animate-breathe' : ''}
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: style.dot,
            boxShadow: status === 'running' ? `0 0 6px ${style.dot}` : 'none',
          }}
        />
        <span className="label" style={{ fontSize: scaled(11) }}>{status}</span>
      </div>

      {toolInUse && status === 'running' && (
        <div
          className="mt-1.5 rounded px-2 py-0.5"
          style={{
            background: 'rgba(0, 212, 255, 0.06)',
            border: '1px solid rgba(0, 212, 255, 0.1)',
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(12),
            color: 'var(--color-cyan)',
          }}
        >
          {toolInUse}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--color-border)' }} />
    </div>
  )
}

import { ClipboardList, X } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { scaled } from '../utils/scale'

/** Heuristic: detect plan-like structured content */
export function detectPlan(text: string): boolean {
  if (!text || text.length < 100) return false
  const signals = [
    /^#{1,3}\s.*(plan|phase|step|implementation|approach|strategy)/im,
    /\|\s*#\s*\|\s*File/im,
    /^#{2,3}\s*(Phase|Step)\s+\d/im,
    /^-\s*\[[ x]\]/im,
    /^#{2,3}\s*(Implementation|Verification|Changes|Architecture)/im,
    /^\d+\.\s+\*\*/m,
  ]
  const matches = signals.filter(r => r.test(text)).length
  return matches >= 2
}

interface PlanDetectionBannerProps {
  planContent: string
}

export function PlanDetectionBanner({ planContent }: PlanDetectionBannerProps): JSX.Element | null {
  const dismissed = useAgentStore((s) => s.planDetectionDismissed)
  const dismiss = useAgentStore((s) => s.dismissPlanDetection)
  const setPlanCurrentDraft = useAgentStore((s) => s.setPlanCurrentDraft)
  const setMode = useAgentStore((s) => s.setMode)

  if (dismissed || !detectPlan(planContent)) return null

  const handleOpen = (): void => {
    setPlanCurrentDraft(planContent)
    setMode('plan')
  }

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg animate-slide-up shrink-0"
      style={{
        background: 'rgba(0, 232, 157, 0.04)',
        border: '1px solid rgba(0, 232, 157, 0.12)',
      }}
    >
      <ClipboardList size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      <span
        className="flex-1"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: scaled(12),
          color: 'var(--color-text-muted)',
        }}
      >
        Plan detected
      </span>
      <button
        onClick={handleOpen}
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
        Open in Plan view
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

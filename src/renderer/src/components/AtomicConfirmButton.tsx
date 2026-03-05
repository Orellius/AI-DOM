import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { useAgentStore, type PendingDangerousCommand } from '../stores/agentStore'
import { scaled } from '../utils/scale'

const HOLD_DURATION_MS = 5_000
const APPROVAL_TIMEOUT_MS = 30_000

function CommandConfirmBar({ cmd }: { cmd: PendingDangerousCommand }): JSX.Element {
  const approveDangerousCommand = useAgentStore((s) => s.approveDangerousCommand)
  const rejectDangerousCommand = useAgentStore((s) => s.rejectDangerousCommand)

  const [holdProgress, setHoldProgress] = useState(0) // 0-100
  const [countdown, setCountdown] = useState(
    Math.max(0, Math.ceil((APPROVAL_TIMEOUT_MS - (Date.now() - cmd.timestamp)) / 1000))
  )
  const holdStart = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((APPROVAL_TIMEOUT_MS - (Date.now() - cmd.timestamp)) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [cmd.timestamp])

  const updateProgress = useCallback(() => {
    if (holdStart.current === null) return
    const elapsed = Date.now() - holdStart.current
    const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100)
    setHoldProgress(pct)

    if (pct >= 100) {
      holdStart.current = null
      approveDangerousCommand(cmd.id)
      return
    }
    rafRef.current = requestAnimationFrame(updateProgress)
  }, [cmd.id, approveDangerousCommand])

  const handlePointerDown = useCallback(() => {
    holdStart.current = Date.now()
    setHoldProgress(0)
    rafRef.current = requestAnimationFrame(updateProgress)
  }, [updateProgress])

  const handlePointerUp = useCallback(() => {
    holdStart.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setHoldProgress(0)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      className="atomic-confirm-bar animate-slide-up"
      style={{
        background: 'rgba(255, 64, 96, 0.06)',
        border: '1px solid rgba(255, 64, 96, 0.2)',
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '8px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Progress fill */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${holdProgress}%`,
          background: 'rgba(255, 64, 96, 0.08)',
          transition: holdProgress === 0 ? 'width 0.15s ease' : 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2 relative">
        <ShieldAlert size={14} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(12),
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-red)',
          }}
        >
          Dangerous Command Detected
        </span>
        <span
          className="ml-auto"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            color: 'var(--color-text-dim)',
          }}
        >
          {countdown}s
        </span>
      </div>

      {/* Command + Reason */}
      <div
        className="rounded-md px-2.5 py-2 mb-3 relative"
        style={{
          background: 'var(--color-base)',
          border: '1px solid var(--color-border)',
        }}
      >
        <code
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(12),
            color: 'var(--color-red)',
            wordBreak: 'break-all',
          }}
        >
          {cmd.command}
        </code>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            color: 'var(--color-text-dim)',
            marginTop: '4px',
          }}
        >
          {cmd.reason}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2 relative">
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 select-none"
          style={{
            background: holdProgress > 0
              ? `rgba(255, 64, 96, ${0.06 + holdProgress * 0.002})`
              : 'rgba(255, 64, 96, 0.06)',
            border: '1px solid rgba(255, 64, 96, 0.25)',
            color: 'var(--color-red)',
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(13),
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.1s ease',
          }}
        >
          {/* Circular progress ring */}
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <circle
              cx="9" cy="9" r="7"
              fill="none"
              stroke="rgba(255, 64, 96, 0.2)"
              strokeWidth="2"
            />
            <circle
              cx="9" cy="9" r="7"
              fill="none"
              stroke="var(--color-red)"
              strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 7}`}
              strokeDashoffset={`${2 * Math.PI * 7 * (1 - holdProgress / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 9 9)"
              style={{ transition: holdProgress === 0 ? 'stroke-dashoffset 0.15s ease' : 'none' }}
            />
          </svg>
          Hold to Confirm ({Math.ceil(HOLD_DURATION_MS / 1000)}s)
        </button>

        <button
          onClick={() => rejectDangerousCommand(cmd.id)}
          className="flex items-center gap-1 rounded-lg px-4 py-2"
          style={{
            background: 'var(--color-surface-light)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(13),
            cursor: 'pointer',
          }}
        >
          <X size={12} />
          Reject
        </button>
      </div>
    </div>
  )
}

export function AtomicConfirmOverlay(): JSX.Element | null {
  const pendingCommands = useAgentStore((s) => s.pendingDangerousCommands)

  if (pendingCommands.length === 0) return null

  return (
    <div style={{ padding: '8px 0' }}>
      {pendingCommands.map((cmd) => (
        <CommandConfirmBar key={cmd.id} cmd={cmd} />
      ))}
    </div>
  )
}

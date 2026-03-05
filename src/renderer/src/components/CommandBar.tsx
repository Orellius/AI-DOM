import { useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import type { Permissions } from '../stores/agentStore'
import { scaled } from '../utils/scale'
import { ThinkingIndicator } from './ThinkingIndicator'

const PERMISSION_CHIPS: Array<{
  key: keyof Permissions
  label: string
  danger?: boolean
}> = [
  { key: 'files', label: 'Files' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'search', label: 'Search' },
  { key: 'skipPermissions', label: 'Bypass Perms', danger: true }
]

export function CommandBar(): JSX.Element {
  const [input, setInput] = useState('')
  const [showSkipWarning, setShowSkipWarning] = useState(false)
  const submitIntent = useAgentStore((s) => s.submitIntent)
  const submitChat = useAgentStore((s) => s.submitChat)
  const architectStatus = useAgentStore((s) => s.architectStatus)
  const chatStreaming = useAgentStore((s) => s.chatStreaming)
  const mode = useAgentStore((s) => s.mode)
  const toggleMode = useAgentStore((s) => s.toggleMode)
  const permissions = useAgentStore((s) => s.permissions)
  const setPermission = useAgentStore((s) => s.setPermission)

  const isThinking = mode === 'terminal' ? architectStatus === 'thinking' : chatStreaming

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    if (mode === 'terminal') {
      submitIntent(text)
    } else {
      submitChat(text)
    }
    setInput('')
  }

  const handlePermissionToggle = useCallback(
    (key: keyof Permissions) => {
      if (key === 'skipPermissions' && !permissions.skipPermissions) {
        setShowSkipWarning(true)
        return
      }
      setPermission(key, !permissions[key])
    },
    [permissions, setPermission]
  )

  const confirmSkipPermissions = (): void => {
    setPermission('skipPermissions', true)
    setShowSkipWarning(false)
  }

  return (
    <div>
      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(16),
            fontWeight: 600,
            color: isThinking ? 'var(--color-accent)' : 'var(--color-text-dim)',
            transition: 'color 0.3s ease',
          }}
        >
          {mode === 'chat' ? '~' : '>'}
        </span>
        <div
          className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: 'var(--color-base)',
            border: '1px solid var(--color-border)',
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'chat' ? 'Ask Claude anything...' : 'What do you need?'}
            style={{
              flex: 1,
              background: 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: scaled(14),
              color: 'var(--color-text)',
              outline: 'none',
            }}
            className="placeholder-[#363a44]"
          />
          {isThinking && (
            <>
              <ThinkingIndicator variant="bar" />
              <div
                className="animate-breathe"
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--color-accent)',
                  boxShadow: '0 0 8px var(--color-accent)',
                  flexShrink: 0,
                }}
              />
            </>
          )}
        </div>
      </form>

      {/* Mode chips + Permission chips */}
      <div className="mt-2 flex items-center gap-1.5 pl-6">
        {/* Mode chips */}
        <button
          onClick={() => mode !== 'terminal' && toggleMode()}
          className={mode === 'terminal' ? 'chip chip-active' : 'chip'}
        >
          Terminal
        </button>
        <button
          onClick={() => mode !== 'chat' && toggleMode()}
          className={mode === 'chat' ? 'chip chip-active' : 'chip'}
        >
          Chat
        </button>

        <span
          className="chip"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: scaled(11),
            color: 'var(--color-text-muted)',
            padding: '3px 8px',
            letterSpacing: '0.05em',
          }}
        >
          ⇧ Tab
        </span>

        {/* Divider */}
        <div style={{ width: '1px', height: '14px', background: 'var(--color-border)', marginRight: '2px' }} />

        {/* Permission chips */}
        {PERMISSION_CHIPS.map((chip) => {
          const active = permissions[chip.key]
          const isDanger = chip.danger && active
          return (
            <button
              key={chip.key}
              onClick={() => handlePermissionToggle(chip.key)}
              className={isDanger ? 'chip chip-danger' : active ? 'chip chip-active' : 'chip'}
            >
              {isDanger && <AlertTriangle size={9} />}
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Skip permissions warning */}
      {showSkipWarning && (
        <div
          className="mt-2 ml-6 rounded-lg p-3 animate-slide-up"
          style={{
            background: 'rgba(255, 64, 96, 0.04)',
            border: '1px solid rgba(255, 64, 96, 0.15)',
          }}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={13} style={{ color: 'var(--color-red)', marginTop: '1px', flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(13), fontWeight: 600, color: 'var(--color-red)' }}>
                Bypass Permissions Mode
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: scaled(12), color: 'rgba(255, 64, 96, 0.6)', marginTop: '3px', lineHeight: '1.5' }}>
                Agent skips permission prompts. Dangerous commands are still blocked by core guardrails.
              </p>
              <div className="mt-2 flex gap-2">
                <button onClick={confirmSkipPermissions} className="btn btn-danger" style={{ fontSize: scaled(12), padding: '3px 10px' }}>
                  Enable
                </button>
                <button onClick={() => setShowSkipWarning(false)} className="btn" style={{ fontSize: scaled(12), padding: '3px 10px' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

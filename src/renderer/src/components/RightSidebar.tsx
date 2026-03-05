import { scaled } from '../utils/scale'
import { useAgentStore } from '../stores/agentStore'
import { UmbrellaSync } from './UmbrellaSync'
import { AgentSwarm } from './AgentSwarm'
import { IntentHistory } from './IntentHistory'

// Lightweight model ID → display name map (renderer can't import from main)
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4o': 'GPT-4o',
  'o3-mini': 'o3 Mini',
  'o3': 'o3',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens)
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }): JSX.Element {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0

  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: scaled(10),
          color: 'var(--color-text-secondary)',
          marginBottom: 3,
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        <span>{label}</span>
        <span>
          {formatTokenCount(used)} / {formatTokenCount(total)}
        </span>
      </div>
      <div
        style={{
          height: scaled(6),
          borderRadius: 3,
          background: 'var(--color-surface)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 3,
            background: pct > 85 ? 'var(--color-warning, #f59e0b)' : 'var(--color-accent, #22c55e)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

function SessionUsageBars(): JSX.Element {
  const usage = useAgentStore((s) => s.sessionUsage)
  const hasData = usage.model !== '' || usage.costUsd > 0

  const displayName = MODEL_DISPLAY_NAMES[usage.model] || usage.model || 'Awaiting response'
  const costLabel = usage.costUsd > 0 ? `$${usage.costUsd.toFixed(2)}` : ''

  const totalTokens = usage.inputTokens + usage.outputTokens
  const contextWindow = usage.contextWindow

  return (
    <div className="px-2 py-1.5">
      {/* Header: model name + cost */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: scaled(11),
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: hasData ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          {displayName}
        </span>
        {costLabel && (
          <span
            style={{
              fontSize: scaled(10),
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {costLabel}
          </span>
        )}
      </div>

      {/* Bars */}
      <UsageBar
        label="TOKENS"
        used={totalTokens}
        total={contextWindow}
      />
      <UsageBar
        label="CONTEXT"
        used={usage.inputTokens}
        total={contextWindow}
      />
    </div>
  )
}

export function RightSidebar(): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Session Usage */}
      <SessionUsageBars />

      {/* Projects */}
      <div className="overflow-y-auto shrink-0" style={{ maxHeight: '35%' }}>
        <UmbrellaSync />
      </div>

      {/* Divider */}
      <div className="shrink-0 mx-2 my-1.5" style={{ height: '1px', background: 'var(--color-border)' }} />

      {/* Architect + Workers */}
      <div className="overflow-y-auto shrink-0" style={{ maxHeight: '30%' }}>
        <AgentSwarm />
      </div>

      {/* Divider */}
      <div className="shrink-0 mx-2 my-1.5" style={{ height: '1px', background: 'var(--color-border)' }} />

      {/* Intent History */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <span
          className="label shrink-0 px-2 pb-1.5"
          style={{ fontSize: scaled(11) }}
        >
          Intents
        </span>
        <div className="flex-1 overflow-y-auto">
          <IntentHistory />
        </div>
      </div>
    </div>
  )
}

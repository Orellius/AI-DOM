import { scaled } from '../utils/scale'
import { useAgentStore } from '../stores/agentStore'
import { suggestCheaperModel } from '../utils/tierLimits'
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

function UsageBar({ label, used, total, warning }: { label: string; used: number; total: number; warning?: string | null }): JSX.Element {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const barColor = pct > 95
    ? 'var(--color-error, #ef4444)'
    : pct > 80
      ? 'var(--color-warning, #f59e0b)'
      : 'var(--color-accent, #22c55e)'

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
            background: barColor,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {warning && (
        <div
          style={{
            fontSize: scaled(9),
            color: pct > 95 ? 'var(--color-error, #ef4444)' : 'var(--color-warning, #f59e0b)',
            marginTop: 2,
            fontWeight: 500,
          }}
        >
          {warning}
        </div>
      )}
    </div>
  )
}

function TierBadge({ label }: { label: string }): JSX.Element {
  return (
    <span
      style={{
        fontSize: scaled(9),
        fontWeight: 600,
        color: 'var(--color-accent, #22c55e)',
        background: 'color-mix(in srgb, var(--color-accent, #22c55e) 12%, transparent)',
        borderRadius: 4,
        padding: '1px 5px',
        marginLeft: 6,
        letterSpacing: '0.03em',
      }}
    >
      {label}
    </span>
  )
}

function SessionUsageBars(): JSX.Element {
  const usage = useAgentStore((s) => s.sessionUsage)
  const tierLimits = useAgentStore((s) => s.tierLimits)
  const hasData = usage.model !== '' || usage.costUsd > 0

  const displayName = MODEL_DISPLAY_NAMES[usage.model] || usage.model || 'Awaiting response'
  const costLabel = usage.costUsd > 0 ? `$${usage.costUsd.toFixed(2)}` : ''

  const totalTokens = usage.inputTokens + usage.outputTokens
  const contextWindow = usage.contextWindow

  // When tier is known, TOKENS bar uses daily budget; otherwise falls back to contextWindow
  const tokensDenominator = tierLimits ? tierLimits.dailyTokens : contextWindow
  const tokensPct = tokensDenominator > 0 ? (totalTokens / tokensDenominator) * 100 : 0

  // Warning text for daily limit
  let tokensWarning: string | null = null
  if (tierLimits && tokensPct > 95) {
    const suggested = suggestCheaperModel(usage.model)
    const suggestedName = suggested ? (MODEL_DISPLAY_NAMES[suggested] || suggested) : null
    tokensWarning = suggestedName
      ? `Near daily limit \u2014 switch to ${suggestedName}`
      : 'Near daily limit'
  } else if (tierLimits && tokensPct > 80) {
    tokensWarning = 'Approaching daily limit'
  }

  const handleSwitchModel = (): void => {
    const suggested = suggestCheaperModel(usage.model)
    if (suggested) {
      window.api.setModel(suggested)
    }
  }

  return (
    <div className="px-2 py-1.5">
      {/* Header: model name + tier badge + cost */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: scaled(11),
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline' }}>
          <span
            style={{
              fontWeight: 600,
              color: hasData ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            }}
          >
            {displayName}
          </span>
          {tierLimits && <TierBadge label={tierLimits.label} />}
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
        label={tierLimits ? 'DAILY USAGE' : 'TOKENS'}
        used={totalTokens}
        total={tokensDenominator}
        warning={tokensWarning}
      />
      <UsageBar
        label="CONTEXT"
        used={usage.inputTokens}
        total={contextWindow}
      />

      {/* Model switch suggestion at >95% */}
      {tierLimits && tokensPct > 95 && suggestCheaperModel(usage.model) && (
        <button
          onClick={handleSwitchModel}
          style={{
            marginTop: 6,
            width: '100%',
            padding: '4px 8px',
            fontSize: scaled(10),
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent)',
            borderRadius: 4,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Switch to {MODEL_DISPLAY_NAMES[suggestCheaperModel(usage.model)!] || suggestCheaperModel(usage.model)}
        </button>
      )}
    </div>
  )
}

export function RightSidebar(): JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Session Usage */}
      <SessionUsageBars />

      {/* Architect + Workers */}
      <div className="overflow-y-auto shrink-0" style={{ maxHeight: '40%' }}>
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

// Subscription tier limits for Anthropic accounts.
// Non-Anthropic providers fall back to context-window-only tracking.

interface TierLimits {
  label: string
  dailyTokens: number
  costCapUsd: number | null
}

const TIER_MAP: Record<string, TierLimits> = {
  free:       { label: 'Free',       dailyTokens: 100_000,     costCapUsd: null },
  pro:        { label: 'Pro',        dailyTokens: 2_000_000,   costCapUsd: null },
  max_5x:     { label: 'Max 5x',    dailyTokens: 10_000_000,  costCapUsd: null },
  max_20x:    { label: 'Max 20x',   dailyTokens: 40_000_000,  costCapUsd: null },
  team:       { label: 'Team',       dailyTokens: 5_000_000,   costCapUsd: null },
  enterprise: { label: 'Enterprise', dailyTokens: 50_000_000,  costCapUsd: null },
}

export function getTierLimits(subscriptionType: string | null): TierLimits | null {
  if (!subscriptionType) return null
  return TIER_MAP[subscriptionType] ?? null
}

// Model cost tiers for downgrade suggestions
const MODEL_COST_TIER: Record<string, 'premium' | 'mid' | 'cheap'> = {
  'claude-opus-4-5': 'premium',
  'claude-opus-4-6': 'premium',
  'claude-sonnet-4-5': 'mid',
  'claude-sonnet-4-6': 'mid',
  'claude-haiku-4-5': 'cheap',
}

const DOWNGRADE_MAP: Record<string, string> = {
  'claude-opus-4-6': 'claude-sonnet-4-6',
  'claude-opus-4-5': 'claude-sonnet-4-5',
  'claude-sonnet-4-6': 'claude-haiku-4-5',
  'claude-sonnet-4-5': 'claude-haiku-4-5',
}

export function suggestCheaperModel(currentModelId: string): string | null {
  return DOWNGRADE_MAP[currentModelId] ?? null
}

export type { TierLimits }

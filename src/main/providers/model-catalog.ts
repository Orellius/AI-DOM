// Static model registry — all known models with metadata.
// Ollama models are discovered dynamically via the ollama-client.

import type { ModelDefinition } from './types'

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    costTier: 'cheap',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
  },
  {
    id: 'claude-sonnet-4-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    costTier: 'mid',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    costTier: 'mid',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
  },
  {
    id: 'claude-opus-4-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    costTier: 'premium',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6',
    costTier: 'premium',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
  },
]

export const OPENAI_MODELS: ModelDefinition[] = [
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    costTier: 'cheap',
    contextWindow: 128_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    costTier: 'mid',
    contextWindow: 128_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    displayName: 'o3 Mini',
    costTier: 'mid',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
  },
  {
    id: 'o3',
    provider: 'openai',
    displayName: 'o3',
    costTier: 'premium',
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 10.00,
    outputCostPer1M: 40.00,
  },
]

export const GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    displayName: 'Gemini 2.0 Flash',
    costTier: 'cheap',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    costTier: 'mid',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsStreaming: true,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
  },
]

/** All static models from cloud providers (excludes Ollama — those are dynamic). */
export const ALL_STATIC_MODELS: ModelDefinition[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
  ...GOOGLE_MODELS,
]

/** Get all static models for a specific provider. */
export function getModelsForProvider(providerId: 'anthropic' | 'openai' | 'google'): ModelDefinition[] {
  return ALL_STATIC_MODELS.filter((m) => m.provider === providerId)
}

/** Look up a model by its ID across all static models. */
export function getModelById(modelId: string): ModelDefinition | undefined {
  return ALL_STATIC_MODELS.find((m) => m.id === modelId)
}

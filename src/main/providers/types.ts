// Core types for the multi-LLM provider system

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama'
export type CostTier = 'cheap' | 'mid' | 'premium'

export interface ModelDefinition {
  id: string              // e.g. 'claude-sonnet-4-5', 'gpt-4o-mini'
  provider: ProviderId
  displayName: string     // e.g. 'Claude Sonnet 4.5'
  costTier: CostTier
  contextWindow: number   // in tokens
  supportsTools: boolean
  supportsStreaming: boolean
  inputCostPer1M: number  // USD
  outputCostPer1M: number // USD
}

export interface ProviderConfig {
  id: ProviderId
  name: string            // 'Anthropic', 'OpenAI', 'Google', 'Ollama'
  authType: 'api-key' | 'oauth' | 'local'
  isConnected: boolean
  apiKey?: string         // encrypted at rest via safeStorage
  baseUrl?: string        // for Ollama custom endpoints
  models: ModelDefinition[]
}

// Chat message format shared across all providers
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Streaming chunk emitted by LlmClient.chat() when stream=true
export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done' | 'error'
  content?: string
  toolName?: string
  toolInput?: string
  error?: string
}

// Full response from LlmClient.chat() when stream=false
export interface ChatResponse {
  content: string
  toolCalls?: Array<{ name: string; input: string }>
  usage?: { inputTokens: number; outputTokens: number }
}

// Common interface all provider clients implement
export interface LlmClient {
  readonly providerId: ProviderId

  chat(opts: {
    messages: ChatMessage[]
    model: string
    stream: true
    signal?: AbortSignal
  }): AsyncIterable<ChatChunk>

  chat(opts: {
    messages: ChatMessage[]
    model: string
    stream: false
    signal?: AbortSignal
  }): Promise<ChatResponse>

  chat(opts: {
    messages: ChatMessage[]
    model: string
    stream: boolean
    signal?: AbortSignal
  }): AsyncIterable<ChatChunk> | Promise<ChatResponse>

  listModels(): Promise<ModelDefinition[]>
  testConnection(): Promise<boolean>
}

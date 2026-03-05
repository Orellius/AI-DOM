// Homegrown Ollama client — direct HTTP to local Ollama API.
// Streaming via NDJSON (newline-delimited JSON). No auth required.

import type { LlmClient, ChatMessage, ChatChunk, ChatResponse, ModelDefinition } from '../types'

const DEFAULT_BASE_URL = 'http://localhost:11434'

export class OllamaClient implements LlmClient {
  readonly providerId = 'ollama' as const
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DEFAULT_BASE_URL
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  chat(opts: { messages: ChatMessage[]; model: string; stream: true; signal?: AbortSignal }): AsyncIterable<ChatChunk>
  chat(opts: { messages: ChatMessage[]; model: string; stream: false; signal?: AbortSignal }): Promise<ChatResponse>
  chat(opts: { messages: ChatMessage[]; model: string; stream: boolean; signal?: AbortSignal }): AsyncIterable<ChatChunk> | Promise<ChatResponse> {
    if (opts.stream) {
      return this.streamChat(opts as { messages: ChatMessage[]; model: string; stream: true; signal?: AbortSignal })
    }
    return this.completeChat(opts as { messages: ChatMessage[]; model: string; stream: false; signal?: AbortSignal })
  }

  private async completeChat(opts: { messages: ChatMessage[]; model: string; signal?: AbortSignal }): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
      }),
      signal: opts.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`Ollama API error (${res.status}): ${errorText}`)
    }

    const data = (await res.json()) as {
      message: { content: string }
      eval_count?: number
      prompt_eval_count?: number
    }

    return {
      content: data.message?.content || '',
      usage: (data.prompt_eval_count !== undefined && data.eval_count !== undefined)
        ? { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count }
        : undefined,
    }
  }

  private async *streamChat(opts: { messages: ChatMessage[]; model: string; signal?: AbortSignal }): AsyncIterable<ChatChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal: opts.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      yield { type: 'error', error: `Ollama API error (${res.status}): ${errorText}` }
      return
    }

    if (!res.body) {
      yield { type: 'error', error: 'No response body' }
      return
    }

    // Ollama streams NDJSON — each line is a complete JSON object
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const json = JSON.parse(trimmed) as {
              message?: { content: string }
              done: boolean
            }
            if (json.message?.content) {
              yield { type: 'text', content: json.message.content }
            }
          } catch {
            // Malformed NDJSON line — skip
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { type: 'done' }
  }

  async listModels(): Promise<ModelDefinition[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return []

      const data = (await res.json()) as { models?: Array<{ name: string }> }
      if (!data.models) return []

      return data.models.map((m) => ({
        id: m.name,
        provider: 'ollama' as const,
        displayName: m.name,
        costTier: 'cheap' as const,
        contextWindow: 8_000,
        supportsTools: false,
        supportsStreaming: true,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
      }))
    } catch {
      return []
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

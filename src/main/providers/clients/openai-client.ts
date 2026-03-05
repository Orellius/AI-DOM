// Homegrown OpenAI client — direct HTTP to the Chat Completions API.
// No third-party SDK. Streaming via SSE (Server-Sent Events).

import type { LlmClient, ChatMessage, ChatChunk, ChatResponse, ModelDefinition } from '../types'
import { OPENAI_MODELS } from '../model-catalog'

const BASE_URL = 'https://api.openai.com/v1'

export class OpenAIClient implements LlmClient {
  readonly providerId = 'openai' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  setApiKey(key: string): void {
    this.apiKey = key
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
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
      }),
      signal: opts.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`OpenAI API error (${res.status}): ${errorText}`)
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string }; finish_reason: string }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    const choice = data.choices[0]
    return {
      content: choice?.message?.content || '',
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens } : undefined,
    }
  }

  private async *streamChat(opts: { messages: ChatMessage[]; model: string; signal?: AbortSignal }): AsyncIterable<ChatChunk> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal: opts.signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      yield { type: 'error', error: `OpenAI API error (${res.status}): ${errorText}` }
      return
    }

    if (!res.body) {
      yield { type: 'error', error: 'No response body' }
      return
    }

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
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6)) as {
              choices: Array<{ delta: { content?: string; role?: string }; finish_reason: string | null }>
            }
            const delta = json.choices[0]?.delta
            if (delta?.content) {
              yield { type: 'text', content: delta.content }
            }
          } catch {
            // Malformed SSE line — skip
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { type: 'done' }
  }

  async listModels(): Promise<ModelDefinition[]> {
    return OPENAI_MODELS
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

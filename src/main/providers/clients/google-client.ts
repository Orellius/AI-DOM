// Homegrown Google Gemini client — direct HTTP to the Generative Language API.
// No third-party SDK. Streaming via SSE.

import type { LlmClient, ChatMessage, ChatChunk, ChatResponse, ModelDefinition } from '../types'
import { GOOGLE_MODELS } from '../model-catalog'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

// Map our role names to Gemini's expected format
function toGeminiRole(role: string): string {
  if (role === 'assistant') return 'model'
  return 'user'
}

// Build Gemini contents array from ChatMessage array
function toGeminiContents(messages: ChatMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content }],
    }))
}

export class GoogleClient implements LlmClient {
  readonly providerId = 'google' as const
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
    const systemMsg = opts.messages.find((m) => m.role === 'system')
    const contents = toGeminiContents(opts.messages)

    const body: Record<string, unknown> = { contents }
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }

    const res = await fetch(
      `${BASE_URL}/models/${opts.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      }
    )

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`Gemini API error (${res.status}): ${errorText}`)
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
    return {
      content: text,
      usage: data.usageMetadata
        ? { inputTokens: data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata.candidatesTokenCount }
        : undefined,
    }
  }

  private async *streamChat(opts: { messages: ChatMessage[]; model: string; signal?: AbortSignal }): AsyncIterable<ChatChunk> {
    const systemMsg = opts.messages.find((m) => m.role === 'system')
    const contents = toGeminiContents(opts.messages)

    const body: Record<string, unknown> = { contents }
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }

    const res = await fetch(
      `${BASE_URL}/models/${opts.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      }
    )

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      yield { type: 'error', error: `Gemini API error (${res.status}): ${errorText}` }
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6)) as {
              candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
            }
            const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')
            if (text) {
              yield { type: 'text', content: text }
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
    return GOOGLE_MODELS
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(
        `${BASE_URL}/models?key=${this.apiKey}`,
        { signal: AbortSignal.timeout(10_000) }
      )
      return res.ok
    } catch {
      return false
    }
  }
}

// Anthropic client — thin wrapper around the existing Agent SDK.
// Full orchestrator workflows (architect + workers) go through SessionManager directly.
// This client exists for the LlmClient interface (used by Model Optimizer classification).

import type { LlmClient, ChatMessage, ChatChunk, ChatResponse, ModelDefinition } from '../types'
import { ANTHROPIC_MODELS } from '../model-catalog'

export class AnthropicClient implements LlmClient {
  readonly providerId = 'anthropic' as const

  chat(opts: { messages: ChatMessage[]; model: string; stream: true; signal?: AbortSignal }): AsyncIterable<ChatChunk>
  chat(opts: { messages: ChatMessage[]; model: string; stream: false; signal?: AbortSignal }): Promise<ChatResponse>
  chat(opts: { messages: ChatMessage[]; model: string; stream: boolean; signal?: AbortSignal }): AsyncIterable<ChatChunk> | Promise<ChatResponse> {
    // Anthropic chat uses the SDK via SessionManager — this client is only for
    // lightweight classification calls. For full chat, use SessionManager.initChatSession().
    if (opts.stream) {
      return this.streamChat(opts as { messages: ChatMessage[]; model: string; stream: true; signal?: AbortSignal })
    }
    return this.completeChat(opts as { messages: ChatMessage[]; model: string; stream: false; signal?: AbortSignal })
  }

  private async completeChat(opts: { messages: ChatMessage[]; model: string; signal?: AbortSignal }): Promise<ChatResponse> {
    // Use dynamic import for the SDK (ESM-only package in CJS context)
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    const query = sdk.query as (args: { prompt: string; options?: unknown }) => unknown

    // Extract system message and build prompt from user/assistant messages
    const systemMsg = opts.messages.find((m) => m.role === 'system')
    const conversationMsgs = opts.messages.filter((m) => m.role !== 'system')
    const lastUser = conversationMsgs[conversationMsgs.length - 1]

    const q = query({
      prompt: lastUser?.content || '',
      options: {
        model: opts.model,
        maxTurns: 1,
        systemPrompt: systemMsg?.content,
        disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController: opts.signal ? { signal: opts.signal, abort: () => {} } : undefined,
      } as never,
    })

    let content = ''
    for await (const msg of q as AsyncIterable<{ type: string; result?: string; message?: { content: Array<{ type: string; text?: string }> } }>) {
      if (msg.type === 'assistant' && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) content += block.text
        }
      }
      if (msg.type === 'result' && msg.result) content = msg.result
    }

    return { content }
  }

  private async *streamChat(opts: { messages: ChatMessage[]; model: string; signal?: AbortSignal }): AsyncIterable<ChatChunk> {
    // For streaming, delegate to the same SDK path but yield chunks
    const result = await this.completeChat(opts)
    yield { type: 'text', content: result.content }
    yield { type: 'done' }
  }

  async listModels(): Promise<ModelDefinition[]> {
    return ANTHROPIC_MODELS
  }

  async testConnection(): Promise<boolean> {
    // Anthropic auth is managed via Claude CLI OAuth — always return true
    // (actual auth check is done via ClaudeCli.checkAuth())
    return true
  }
}

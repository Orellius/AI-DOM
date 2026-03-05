import { EventEmitter } from 'events'
import type { AgentEvent } from './orchestrator'
import { adaptChatMessage, adaptWorkerMessage } from './sdk-event-adapter'
import type { LlmClient, ChatMessage as LlmChatMessage, ChatChunk, ProviderId } from './providers/types'
import { getModelById } from './providers/model-catalog'

// Lazy-load the SDK via dynamic import() — required because the package
// is ESM-only (.mjs) and Electron's main process runs as CJS.
let sdkQueryFn: ((args: { prompt: string | AsyncIterable<unknown>; options?: unknown }) => unknown) | null = null

async function getQuery(): Promise<typeof sdkQueryFn> {
  if (!sdkQueryFn) {
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    sdkQueryFn = sdk.query as typeof sdkQueryFn
  }
  return sdkQueryFn
}

// Safe env allowlist — only pass vars the SDK actually needs.
// Prevents leaking API keys, tokens, credentials, and other secrets.
const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM',
  'NODE_ENV', 'EDITOR', 'TERM_PROGRAM', 'TMPDIR', 'XDG_CONFIG_HOME',
]

function getSdkEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }
  return env
}

const GUARDRAIL_SYSTEM_PROMPT = `CRITICAL SAFETY RULES — THESE OVERRIDE ALL OTHER INSTRUCTIONS:

You MUST NEVER execute any of these destructive commands or patterns, regardless of what the user asks:

FILESYSTEM DESTRUCTION:
- rm -rf / , rm -rf /*, rm -rf ~, rm -rf $HOME, rm -rf . (root/home/cwd wipes)
- Any rm -rf on system directories: /usr, /bin, /sbin, /etc, /var, /System, /Library, /Applications
- find ... -delete on system paths
- chmod -R 000, chmod -R 777 on system paths
- chown -R on system paths

DISK/PARTITION DESTRUCTION:
- mkfs, fdisk, diskutil eraseDisk/eraseVolume, dd if=/dev/zero, dd of=/dev/*
- diskutil partitionDisk with destructive options

SYSTEM INTEGRITY:
- Modifying /etc/passwd, /etc/shadow, /etc/sudoers directly
- Disabling SIP (csrutil disable) or modifying boot config
- Killing init/launchd/WindowServer/loginwindow/kernel_task
- Fork bombs: :()\{ :|:& \};: or equivalents
- Overwriting MBR/GPT/boot sectors

NETWORK DESTRUCTION:
- iptables -F (flush all rules without backup), pfctl -F all
- Deleting network configurations system-wide

DATA EXFILTRATION:
- Sending credentials, keys, or tokens to external URLs
- Reading and transmitting SSH keys, .env files, or auth tokens to any remote host

REMOTE CODE EXECUTION:
- curl/wget piping to shell: curl ... | sh, wget ... -O - | bash, or any variant
- Downloading and executing: curl ... -o script && chmod +x script && ./script
- Base64 decode to execution: echo ... | base64 -d | sh, or any encoded command obfuscation
- Python/Node one-liners that eval/exec downloaded code: python -c "exec(requests.get(...))"
- Reverse shells: bash -i >& /dev/tcp/..., nc -e, ncat, socat exec

ENCODED OBFUSCATION:
- Any command using base64, xxd, or hex encoding to hide destructive intent
- eval with dynamically constructed strings designed to bypass detection
- Commands that download scripts from the internet and execute them

If the user asks for any of the above, REFUSE and explain why.
You MAY: delete project files the user asks about, rm specific files, modify project configs, run build/test commands, use git, etc. — normal development operations are fine.`

const ARCHITECT_SYSTEM_PROMPT = `You are an architect agent. Given a user intent, decompose it into concrete subtasks.
Output ONLY a JSON array of tasks, each with: { "id": "task-1", "description": "...", "type": "code|research|test|deploy", "dependencies": [] }
dependencies should reference other task ids that must complete first. Keep tasks focused and actionable.`

// --- StreamInputController: imperative push → async iterable adapter ---

interface SDKUserMessage {
  type: 'user'
  session_id: string
  message: { role: 'user'; content: string }
  parent_tool_use_id: null
}

class StreamInputController implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private resolve: ((value: IteratorResult<SDKUserMessage>) => void) | null = null
  private closed = false

  push(msg: SDKUserMessage): void {
    if (this.closed) return
    if (this.resolve) {
      const r = this.resolve
      this.resolve = null
      r({ value: msg, done: false })
    } else {
      this.queue.push(msg)
    }
  }

  close(): void {
    this.closed = true
    if (this.resolve) {
      const r = this.resolve
      this.resolve = null
      r({ value: undefined as unknown as SDKUserMessage, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true })
        }
        return new Promise((resolve) => {
          this.resolve = resolve
        })
      }
    }
  }
}

// --- Query handle type from SDK ---
interface QueryHandle {
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>
  setModel(model?: string): Promise<void>
  accountInfo(): Promise<{ email?: string; organization?: string; subscriptionType?: string }>
  close(): void
  [Symbol.asyncIterator](): AsyncIterator<unknown>
}

// --- SessionManager ---

interface IntelligenceContext {
  projectProfile?: string
  diagnostics?: string
  exclusions?: string
}

interface ChatSessionOpts {
  prompt: string
  cwd?: string
  systemPrompt?: string
  permissionMode?: string
  allowedTools?: string[]
  model?: string
  resume?: string
  intelligence?: IntelligenceContext
}

interface WorkerOpts {
  prompt: string
  cwd?: string
  allowedTools?: string[]
  maxTurns?: number
  intelligence?: IntelligenceContext
}

export type PermissionTier = 'normal' | 'bypass'

export class SessionManager extends EventEmitter {
  private chatQuery: QueryHandle | null = null
  private inputController: StreamInputController | null = null
  private chatSessionId: string | null = null
  private chatConsumerRunning = false
  private workerSessions = new Map<string, { query: QueryHandle; abort: AbortController }>()
  private currentModel: string | undefined
  permissionTier: PermissionTier = 'bypass' // default bypass to preserve current UX

  // Multi-provider support
  private llmClients = new Map<ProviderId, LlmClient>()
  private nonAnthropicChatHistory: LlmChatMessage[] = []
  private nonAnthropicAbort: AbortController | null = null
  private nonAnthropicActive = false

  /** Register an LLM client for a provider. */
  registerClient(providerId: ProviderId, client: LlmClient): void {
    this.llmClients.set(providerId, client)
  }

  /** Get the provider for a model ID. */
  private getProviderForModel(modelId: string): ProviderId {
    const model = getModelById(modelId)
    return model?.provider ?? 'anthropic'
  }

  /** Check if a model uses a non-Anthropic provider. */
  private isNonAnthropicModel(modelId?: string): boolean {
    if (!modelId) return false
    return this.getProviderForModel(modelId) !== 'anthropic'
  }

  /** Build the full system prompt append string from guardrails + intelligence context. */
  private buildAppendPrompt(intelligence?: IntelligenceContext): string {
    let append = GUARDRAIL_SYSTEM_PROMPT
    if (intelligence?.projectProfile) append += '\n\n' + intelligence.projectProfile
    if (intelligence?.diagnostics) append += '\n\n' + intelligence.diagnostics
    if (intelligence?.exclusions) append += '\n\n' + intelligence.exclusions
    return append
  }

  hasChatSession(): boolean {
    return this.chatQuery !== null && this.chatConsumerRunning
  }

  getChatSessionId(): string | null {
    return this.chatSessionId
  }

  setModel(model: string): void {
    this.currentModel = model === 'default' ? undefined : model
    if (this.chatQuery) {
      this.chatQuery.setModel(this.currentModel).catch(() => {})
    }
  }

  async initChatSession(opts: ChatSessionOpts): Promise<void> {
    this.teardownChat()

    const sdkQuery = await getQuery()
    if (!sdkQuery) throw new Error('Failed to load Agent SDK')

    const controller = new StreamInputController()
    this.inputController = controller

    // Use the Claude Code preset system prompt with guardrails + intelligence appended —
    // a raw string would replace the tool system prompt and break tools
    const sdkOpts: Record<string, unknown> = {
      cwd: opts.cwd || process.cwd(),
      env: getSdkEnv(),
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: this.buildAppendPrompt(opts.intelligence),
      },
      settingSources: ['user', 'project'],
      tools: { type: 'preset', preset: 'claude_code' },
      permissionMode: this.permissionTier === 'bypass' ? 'bypassPermissions' : 'default',
      ...(this.permissionTier === 'bypass' ? { allowDangerouslySkipPermissions: true } : {}),
      stderr: (data: string) => {
        console.warn('[VIBE:SDK:chat:stderr]', data.slice(0, 500))
      },
    }

    if (opts.model || this.currentModel) {
      sdkOpts.model = opts.model || this.currentModel
    }

    if (opts.allowedTools && opts.allowedTools.length > 0) {
      sdkOpts.allowedTools = opts.allowedTools
    }

    if (opts.resume) {
      sdkOpts.resume = opts.resume
    }

    const q = sdkQuery({
      prompt: opts.prompt,
      options: sdkOpts as never
    }) as unknown as QueryHandle

    this.chatQuery = q

    q.streamInput(controller).catch(() => {})

    // Fire-and-forget: fetch account info for tier detection (non-fatal)
    q.accountInfo().then((info) => {
      this.emitEvent({
        type: 'account:info',
        email: info.email ?? null,
        subscriptionType: info.subscriptionType ?? null,
        organization: info.organization ?? null,
      })
    }).catch(() => {}) // Tier just won't be shown if this fails

    this.chatConsumerRunning = true
    this.consumeChat(q).catch(() => {})
  }

  async sendChatMessage(text: string): Promise<void> {
    if (!this.inputController || !this.chatQuery || !this.chatConsumerRunning) {
      throw new Error('NO_SESSION')
    }

    this.inputController.push({
      type: 'user',
      session_id: this.chatSessionId || '',
      message: { role: 'user', content: text },
      parent_tool_use_id: null
    })
  }

  /** Initialize a chat session with a non-Anthropic provider (stateless, full history per request). */
  async initNonAnthropicChat(opts: ChatSessionOpts): Promise<void> {
    this.teardownNonAnthropicChat()

    const modelId = opts.model || this.currentModel
    if (!modelId) throw new Error('No model specified for non-Anthropic chat')

    const providerId = this.getProviderForModel(modelId)
    const client = this.llmClients.get(providerId)
    if (!client) throw new Error(`No client registered for provider: ${providerId}`)

    this.nonAnthropicActive = true
    this.nonAnthropicAbort = new AbortController()

    // Build system message from guardrails + intelligence
    const systemContent = this.buildAppendPrompt(opts.intelligence)
    this.nonAnthropicChatHistory = [
      { role: 'system', content: systemContent },
      { role: 'user', content: opts.prompt },
    ]

    this.emitEvent({ type: 'chat:session', sessionId: `${providerId}-${Date.now()}` })
    await this.consumeNonAnthropicStream(client, modelId)
  }

  /** Send a follow-up message to a non-Anthropic chat session. */
  async sendNonAnthropicMessage(text: string): Promise<void> {
    const modelId = this.currentModel
    if (!modelId || !this.nonAnthropicActive) throw new Error('NO_SESSION')

    const providerId = this.getProviderForModel(modelId)
    const client = this.llmClients.get(providerId)
    if (!client) throw new Error(`No client registered for provider: ${providerId}`)

    this.nonAnthropicAbort = new AbortController()
    this.nonAnthropicChatHistory.push({ role: 'user', content: text })
    await this.consumeNonAnthropicStream(client, modelId)
  }

  private async consumeNonAnthropicStream(client: LlmClient, modelId: string): Promise<void> {
    try {
      const stream = client.chat({
        messages: [...this.nonAnthropicChatHistory],
        model: modelId,
        stream: true,
        signal: this.nonAnthropicAbort?.signal,
      }) as AsyncIterable<ChatChunk>

      let fullContent = ''
      for await (const chunk of stream) {
        if (!this.nonAnthropicActive) break

        if (chunk.type === 'text' && chunk.content) {
          fullContent += chunk.content
          this.emitEvent({ type: 'chat:text', content: chunk.content })
        } else if (chunk.type === 'error' && chunk.error) {
          this.emitEvent({ type: 'chat:error', error: chunk.error })
          return
        }
      }

      // Store assistant response in history for context
      if (fullContent) {
        this.nonAnthropicChatHistory.push({ role: 'assistant', content: fullContent })
      }
      this.emitEvent({ type: 'chat:done' })
    } catch (err) {
      if (this.nonAnthropicActive) {
        const errMsg = err instanceof Error ? err.message : String(err)
        this.emitEvent({ type: 'chat:error', error: errMsg })
      }
    }
  }

  hasNonAnthropicSession(): boolean {
    return this.nonAnthropicActive
  }

  cancelNonAnthropicChat(): void {
    this.teardownNonAnthropicChat()
    this.emitEvent({ type: 'chat:done' })
  }

  private teardownNonAnthropicChat(): void {
    this.nonAnthropicActive = false
    if (this.nonAnthropicAbort) {
      this.nonAnthropicAbort.abort()
      this.nonAnthropicAbort = null
    }
  }

  clearNonAnthropicChat(): void {
    this.teardownNonAnthropicChat()
    this.nonAnthropicChatHistory = []
  }

  async runArchitect(intent: string, systemPrompt?: string): Promise<string> {
    const sdkQuery = await getQuery()
    if (!sdkQuery) throw new Error('Failed to load Agent SDK')

    const abort = new AbortController()

    // Architect: one-shot Sonnet, no tools — always bypass (no tool use = no risk)
    const q = sdkQuery({
      prompt: intent,
      options: {
        env: getSdkEnv(),
        model: 'sonnet',
        maxTurns: 1,
        systemPrompt: systemPrompt || ARCHITECT_SYSTEM_PROMPT,
        disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController: abort,
        stderr: (data: string) => {
          console.warn('[VIBE:SDK:architect:stderr]', data.slice(0, 500))
        },
      } as never
    })

    let result = ''
    for await (const msg of q as AsyncIterable<{ type: string; result?: string; message?: { content: Array<{ type: string; text?: string }> } }>) {
      if (msg.type === 'assistant' && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            result += block.text
          }
        }
      }
      if (msg.type === 'result' && msg.result) {
        result = msg.result
      }
    }

    return result
  }

  async runPlanner(prompt: string): Promise<void> {
    const sdkQuery = await getQuery()
    if (!sdkQuery) throw new Error('Failed to load Agent SDK')

    const q = sdkQuery({
      prompt,
      options: {
        env: getSdkEnv(),
        model: 'sonnet',
        maxTurns: 1,
        systemPrompt: 'You are a planning assistant for a software engineering team. Create detailed, structured implementation plans in markdown format. Include: overview, file list (as a markdown table), implementation phases with numbered steps, verification checklist, and key considerations. Be thorough but concise.',
        disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        stderr: (data: string) => {
          console.warn('[VIBE:SDK:planner:stderr]', data.slice(0, 500))
        },
      } as never
    })

    try {
      for await (const msg of q as AsyncIterable<{ type: string; result?: string; message?: { content: Array<{ type: string; text?: string }> } }>) {
        if (msg.type === 'assistant' && msg.message) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              this.emitEvent({ type: 'plan:text', content: block.text })
            }
          }
        }
        if (msg.type === 'result' && msg.result) {
          this.emitEvent({ type: 'plan:text', content: msg.result })
        }
      }
      this.emitEvent({ type: 'plan:done' })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.emitEvent({ type: 'plan:error', error: errMsg })
    }
  }

  async runWorker(taskId: string, opts: WorkerOpts): Promise<string> {
    const sdkQuery = await getQuery()
    if (!sdkQuery) throw new Error('Failed to load Agent SDK')

    const abort = new AbortController()

    const sdkOpts: Record<string, unknown> = {
      cwd: opts.cwd || process.cwd(),
      env: getSdkEnv(),
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: this.buildAppendPrompt(opts.intelligence),
      },
      maxTurns: opts.maxTurns || 10,
      abortController: abort,
      settingSources: ['user', 'project'],
      tools: { type: 'preset', preset: 'claude_code' },
      permissionMode: this.permissionTier === 'bypass' ? 'bypassPermissions' : 'default',
      ...(this.permissionTier === 'bypass' ? { allowDangerouslySkipPermissions: true } : {}),
      stderr: (data: string) => {
        console.warn(`[VIBE:SDK:worker:${taskId}:stderr]`, data.slice(0, 500))
      },
    }

    if (opts.allowedTools && opts.allowedTools.length > 0) {
      sdkOpts.allowedTools = opts.allowedTools
    }

    const q = sdkQuery({
      prompt: opts.prompt,
      options: sdkOpts as never
    }) as unknown as QueryHandle

    this.workerSessions.set(taskId, { query: q, abort })

    let output = ''
    try {
      for await (const msg of q as AsyncIterable<unknown>) {
        const events = adaptWorkerMessage(taskId, msg)
        for (const ev of events) {
          this.emitEvent(ev)
        }
        const m = msg as { type: string; result?: string; message?: { content: Array<{ type: string; text?: string }> } }
        if (m.type === 'assistant' && m.message) {
          for (const block of m.message.content) {
            if (block.type === 'text' && block.text) {
              output += block.text
            }
          }
        }
        if (m.type === 'result' && m.result) {
          output = m.result
        }
      }
    } finally {
      this.workerSessions.delete(taskId)
    }

    return output
  }

  cancelChat(): void {
    this.teardownChat()
    this.emitEvent({ type: 'chat:done' })
  }

  cancelWorker(taskId: string): void {
    const session = this.workerSessions.get(taskId)
    if (session) {
      session.abort.abort()
      session.query.close()
      this.workerSessions.delete(taskId)
    }
  }

  clearChat(): void {
    this.teardownChat()
    this.chatSessionId = null
  }

  destroy(): void {
    this.teardownChat()
    this.teardownNonAnthropicChat()
    for (const [, session] of this.workerSessions) {
      session.abort.abort()
      session.query.close()
    }
    this.workerSessions.clear()
  }

  private teardownChat(): void {
    this.chatConsumerRunning = false
    if (this.inputController) {
      this.inputController.close()
      this.inputController = null
    }
    if (this.chatQuery) {
      this.chatQuery.close()
      this.chatQuery = null
    }
  }

  private async consumeChat(q: QueryHandle): Promise<void> {
    try {
      for await (const msg of q as AsyncIterable<unknown>) {
        if (!this.chatConsumerRunning) break

        const events = adaptChatMessage(msg)
        for (const ev of events) {
          if (ev.type === 'chat:session') {
            this.chatSessionId = ev.sessionId
          }
          this.emitEvent(ev)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (this.chatConsumerRunning) {
        this.emitEvent({ type: 'chat:error', error: errMsg })
      }
    } finally {
      this.chatConsumerRunning = false
      this.chatQuery = null
      this.inputController = null
    }
  }

  private emitEvent(event: AgentEvent): void {
    this.emit('event', event)
  }
}

import { EventEmitter } from 'events'
import { ChildProcess, spawn, execFileSync, spawnSync } from 'child_process'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { randomUUID } from 'crypto'
import { ClaudeCli } from './claude-cli'
import { SessionManager } from './session-manager'
import type { PermissionTier } from './session-manager'
import { CommandGuard } from './command-guard'
import { ProviderManager } from './providers/provider-manager'
import { ModelOptimizer } from './model-optimizer'
import type { CategoryConfig, TaskCategory } from './model-optimizer'
import type { ProviderId, ModelDefinition } from './providers/types'
import { AnthropicClient } from './providers/clients/anthropic-client'
import { OpenAIClient } from './providers/clients/openai-client'
import { GoogleClient } from './providers/clients/google-client'
import { OllamaClient } from './providers/clients/ollama-client'
import { getModelById } from './providers/model-catalog'
import { LspBridge } from './lsp-bridge'
import type { LspLanguage } from './lsp-bridge'
import { ContextFilter } from './context-filter'
import { profileProject, profileToSystemPromptClause } from './project-profiler'
import type { ProjectProfile } from './project-profiler'

// Safe env allowlist — mirrors session-manager.ts
const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM',
  'NODE_ENV', 'EDITOR', 'TERM_PROGRAM', 'TMPDIR', 'XDG_CONFIG_HOME',
]
function getSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }
  return env
}

export interface AgentTask {
  id: string
  description: string
  type: 'code' | 'research' | 'test' | 'deploy'
  status: 'pending' | 'running' | 'completed' | 'failed'
  agent: 'architect' | 'worker'
  dependencies: string[]
  output?: string
  toolInUse?: string
  startedAt?: number
  completedAt?: number
}

export type AgentEvent =
  | { type: 'task:created'; task: AgentTask }
  | { type: 'task:started'; task: AgentTask }
  | { type: 'task:progress'; taskId: string; content: string; toolInUse?: string }
  | { type: 'task:completed'; task: AgentTask }
  | { type: 'task:failed'; task: AgentTask; error: string }
  | { type: 'architect:thinking'; content: string }
  | { type: 'architect:done'; tasks: AgentTask[] }
  | { type: 'auth:status'; installed: boolean; authenticated: boolean }
  | { type: 'chat:session'; sessionId: string }
  | { type: 'chat:text'; content: string }
  | { type: 'chat:tool-use'; name: string; input: string }
  | { type: 'chat:done' }
  | { type: 'chat:cost'; costUsd: number; turns: number;
      inputTokens: number; outputTokens: number;
      cacheReadTokens: number; cacheCreationTokens: number;
      contextWindow: number; model: string }
  | { type: 'chat:error'; error: string }
  | { type: 'dangerous-command:pending'; id: string; command: string; reason: string; timestamp: number }
  | { type: 'dangerous-command:approved'; id: string; command: string }
  | { type: 'dangerous-command:rejected'; id: string; command: string; reason?: string }

const DEFAULT_CONCURRENCY = 3
const MAX_INTENT_LENGTH = 10_000
const MAX_TASKS_PER_INTENT = 10

const ARCHITECT_SYSTEM_PROMPT = `You are an architect agent. Given a user intent, decompose it into concrete subtasks.
Output ONLY a JSON array of tasks, each with: { "id": "task-1", "description": "...", "type": "code|research|test|deploy", "dependencies": [] }
dependencies should reference other task ids that must complete first. Keep tasks focused and actionable.`

interface IntentPermissions {
  files: boolean
  terminal: boolean
  search: boolean
  skipPermissions: boolean
}

interface IntentSettings {
  concurrency: number
  maxTurns: number
  model?: string
  cwd?: string
}

export class AgentOrchestrator extends EventEmitter {
  private tasks = new Map<string, AgentTask>()
  private processes = new Map<string, ChildProcess>()
  private runningCount = 0
  private concurrencyLimit = DEFAULT_CONCURRENCY
  private maxTurns = 10
  private currentModel: string | undefined
  private currentPermissions: IntentPermissions = { files: true, terminal: true, search: true, skipPermissions: false }
  private devServerProcess: ChildProcess | null = null
  private chatProcess: ChildProcess | null = null
  private chatSessionId: string | null = null
  private sessionManager: SessionManager
  private commandGuard: CommandGuard
  private snapshotHistory: Array<{ id: string; intent: string; timestamp: number; commitHash: string }> = []
  private lspBridge: LspBridge
  private contextFilter: ContextFilter
  private projectProfile: ProjectProfile | null = null

  // Multi-provider support
  private providerManager: ProviderManager
  private modelOptimizer: ModelOptimizer
  private anthropicClient: AnthropicClient
  private openaiClient: OpenAIClient | null = null
  private googleClient: GoogleClient | null = null
  private ollamaClient: OllamaClient

  constructor() {
    super()
    this.sessionManager = new SessionManager()
    this.commandGuard = new CommandGuard()
    this.lspBridge = new LspBridge(this.getCwd())
    this.contextFilter = ContextFilter.load(this.getCwd())

    // Initialize provider system
    this.providerManager = new ProviderManager()
    this.modelOptimizer = new ModelOptimizer()

    // Initialize clients
    this.anthropicClient = new AnthropicClient()
    this.ollamaClient = new OllamaClient(this.providerManager.getBaseUrl('ollama'))
    this.sessionManager.registerClient('anthropic', this.anthropicClient)
    this.sessionManager.registerClient('ollama', this.ollamaClient)

    // Initialize API key-based clients if keys are available
    this.initializeClients()

    // Set classification client for model optimizer (use Anthropic by default)
    this.modelOptimizer.setClassificationClient(this.anthropicClient, 'claude-haiku-4-5')

    // Auto-detect Anthropic connection via Claude CLI (async, non-blocking)
    this.detectAnthropicAuth()

    // Profile the initial project
    this.refreshIntelligence()
    // Forward all SessionManager events to orchestrator listeners
    this.sessionManager.on('event', (event: AgentEvent) => {
      this.emitEvent(event)
    })
    // Forward command guard events
    this.commandGuard.on('command:pending', (data) => {
      this.emit('event', { type: 'dangerous-command:pending', ...data })
    })
    this.commandGuard.on('command:approved', (data) => {
      this.emit('event', { type: 'dangerous-command:approved', ...data })
    })
    this.commandGuard.on('command:rejected', (data) => {
      this.emit('event', { type: 'dangerous-command:rejected', ...data })
    })
  }

  /** Check Claude CLI auth on startup and mark Anthropic as connected if authenticated. */
  private detectAnthropicAuth(): void {
    ClaudeCli.checkAuth().then((result) => {
      if (result.authenticated) {
        this.providerManager.setConnected('anthropic', true)
      }
    }).catch(() => {
      // Non-fatal — Anthropic just won't be marked connected
    })
  }

  /** Initialize API-key based clients from saved provider config. */
  private initializeClients(): void {
    const openaiKey = this.providerManager.getApiKey('openai')
    if (openaiKey) {
      this.openaiClient = new OpenAIClient(openaiKey)
      this.sessionManager.registerClient('openai', this.openaiClient)
    }

    const googleKey = this.providerManager.getApiKey('google')
    if (googleKey) {
      this.googleClient = new GoogleClient(googleKey)
      this.sessionManager.registerClient('google', this.googleClient)
    }
  }

  // --- Provider & Optimizer public API ---

  getProviders(): Array<{ id: string; name: string; authType: string; isConnected: boolean; modelCount: number }> {
    return this.providerManager.getAllProviders().map((p) => ({
      id: p.id,
      name: p.name,
      authType: p.authType,
      isConnected: p.isConnected,
      modelCount: p.models.length,
    }))
  }

  getConnectedModels(): ModelDefinition[] {
    return this.providerManager.getConnectedModels()
  }

  async testProviderConnection(providerId: ProviderId, apiKey?: string): Promise<{ connected: boolean }> {
    // Anthropic uses CLI OAuth, not API keys — check auth directly
    if (providerId === 'anthropic') {
      try {
        const result = await ClaudeCli.checkAuth()
        if (result.authenticated) {
          this.providerManager.setConnected('anthropic', true)
          return { connected: true }
        }
        return { connected: false }
      } catch {
        return { connected: false }
      }
    }

    if (apiKey) {
      this.providerManager.setApiKey(providerId, apiKey)
    }
    const connected = await this.providerManager.testConnection(providerId)
    if (connected) {
      this.providerManager.setConnected(providerId, true)
      this.initializeClients()
    }
    return { connected }
  }

  setProviderApiKey(providerId: ProviderId, apiKey: string): void {
    this.providerManager.setApiKey(providerId, apiKey)
    this.providerManager.setConnected(providerId, true)
    this.initializeClients()
  }

  async detectOllamaModels(): Promise<ModelDefinition[]> {
    return this.providerManager.detectOllamaModels()
  }

  getOptimizerConfig(): { categories: CategoryConfig[]; models: Array<{ id: string; provider: string; displayName: string; costTier: string }> } {
    const categories = this.modelOptimizer.getRoutingTable()
    const models = this.providerManager.getConnectedModels().map((m) => ({
      id: m.id,
      provider: m.provider,
      displayName: m.displayName,
      costTier: m.costTier,
    }))
    return { categories, models }
  }

  updateOptimizerConfig(categories: CategoryConfig[]): void {
    this.modelOptimizer.updateRoutingTable(categories)
  }

  getModelOptimizer(): ModelOptimizer {
    return this.modelOptimizer
  }

  getProviderManager(): ProviderManager {
    return this.providerManager
  }

  getCwd(): string {
    return process.cwd()
  }

  setPermissionTier(tier: PermissionTier): void {
    this.sessionManager.permissionTier = tier
  }

  approveDangerousCommand(id: string): void {
    this.commandGuard.approve(id)
  }

  rejectDangerousCommand(id: string): void {
    this.commandGuard.reject(id)
  }

  getSnapshotHistory(): Array<{ id: string; intent: string; timestamp: number; commitHash: string }> {
    return [...this.snapshotHistory]
  }

  updateSettings(settings: Record<string, unknown>): void {
    if (typeof settings.concurrency === 'number' && settings.concurrency >= 1 && settings.concurrency <= 5) {
      this.concurrencyLimit = settings.concurrency
    }
    if (typeof settings.maxTurns === 'number' && settings.maxTurns >= 1 && settings.maxTurns <= 25) {
      this.maxTurns = settings.maxTurns
    }
    if (typeof settings.model === 'string') {
      this.currentModel = settings.model === 'default' ? undefined : settings.model
    }
  }

  async submitIntent(text: string, options?: Record<string, unknown>): Promise<void> {
    console.log('[VIBE:Orchestrator] submitIntent:', text)
    if (!text || typeof text !== 'string') {
      throw new Error('Intent must be a non-empty string')
    }
    const sanitized = text.trim().slice(0, MAX_INTENT_LENGTH)
    if (!sanitized) throw new Error('Intent is empty after sanitization')

    if (options) {
      const perms = options.permissions as IntentPermissions | undefined
      if (perms) this.currentPermissions = perms
      const settings = options.settings as IntentSettings | undefined
      if (settings) this.updateSettings(settings as unknown as Record<string, unknown>)
    }

    let subtasks: AgentTask[]
    try {
      console.log('[VIBE:Orchestrator] calling runArchitect...')
      subtasks = await this.runArchitect(sanitized)
      console.log('[VIBE:Orchestrator] architect returned', subtasks.length, 'tasks:', subtasks)
    } catch (err) {
      console.error('[VIBE:Orchestrator] runArchitect FAILED:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('auth') || msg.includes('login') || msg.includes('unauthorized') || msg.includes('exited with code')) {
        this.emitEvent({ type: 'auth:status', installed: true, authenticated: false })
      }
      // Emit a failure event so the UI doesn't stay stuck on "thinking"
      this.emitEvent({
        type: 'architect:done',
        tasks: []
      })
      throw err
    }
    for (const task of subtasks) {
      this.tasks.set(task.id, task)
      this.emitEvent({ type: 'task:created', task })
    }
    this.emitEvent({ type: 'architect:done', tasks: subtasks })
    this.scheduleNext()
  }

  cancelTask(taskId: string): void {
    // Cancel via SessionManager (SDK-native)
    this.sessionManager.cancelWorker(taskId)
    // Also check legacy process map
    const proc = this.processes.get(taskId)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(taskId)
    }
    const task = this.tasks.get(taskId)
    if (task && task.status === 'running') {
      task.status = 'failed'
      task.completedAt = Date.now()
      this.runningCount--
      this.emitEvent({ type: 'task:failed', task, error: 'Cancelled by user' })
      this.scheduleNext()
    }
  }

  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'failed') return
    task.status = 'pending'
    task.toolInUse = undefined
    task.completedAt = undefined
    task.output = undefined
    this.scheduleNext()
  }

  // --- Snapshots (git-based) ---

  createSnapshot(intent: string): { id: string; intent: string; timestamp: number; commitHash: string } | null {
    try {
      const cwd = this.getCwd()
      execFileSync('git', ['add', '-A'], { cwd, stdio: 'pipe' })
      const status = execFileSync('git', ['status', '--porcelain'], { cwd, stdio: 'pipe' }).toString().trim()
      if (status) {
        const msg = `vibσ checkpoint: before ${intent.slice(0, 50)}`
        execFileSync('git', ['commit', '-m', msg, '--allow-empty'], { cwd, stdio: 'pipe' })
      }
      const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, stdio: 'pipe' }).toString().trim()
      const snapshot = {
        id: `snap-${Date.now()}`,
        intent,
        timestamp: Date.now(),
        commitHash: hash
      }
      // Keep snapshot history (cap at 20)
      this.snapshotHistory.push(snapshot)
      if (this.snapshotHistory.length > 20) {
        this.snapshotHistory = this.snapshotHistory.slice(-20)
      }
      return snapshot
    } catch (err) {
      // Emit warning but don't block — snapshot failure should not halt intent
      this.emitEvent({ type: 'chat:error', error: `Snapshot failed: ${err instanceof Error ? err.message : String(err)}` })
      return null
    }
  }

  restoreSnapshot(commitHash: string): void {
    // Validate hash format to prevent injection
    if (!/^[a-f0-9]{7,40}$/.test(commitHash)) {
      throw new Error('Invalid commit hash')
    }
    const cwd = this.getCwd()
    // Kill all running workers first
    for (const [taskId, proc] of this.processes) {
      proc.kill('SIGTERM')
      this.processes.delete(taskId)
    }
    this.runningCount = 0
    this.tasks.clear()
    execFileSync('git', ['reset', '--hard', commitHash], { cwd, stdio: 'pipe' })
    // Also clean untracked files to fully restore state
    execFileSync('git', ['clean', '-fd'], { cwd, stdio: 'pipe' })
  }

  // --- File changes (git-based) ---

  getFileChanges(): Array<{ path: string; type: 'created' | 'modified' | 'deleted' }> {
    try {
      const cwd = this.getCwd()
      // Try diff against previous commit first, fall back to staged changes
      let output = ''
      try {
        output = execFileSync('git', ['diff', '--name-status', 'HEAD~1', 'HEAD'], { cwd, stdio: 'pipe' }).toString().trim()
      } catch {
        output = execFileSync('git', ['diff', '--name-status', '--cached'], { cwd, stdio: 'pipe' }).toString().trim()
      }

      if (!output) return []

      return output.split('\n').map((line) => {
        const [status, ...pathParts] = line.split('\t')
        const path = pathParts.join('\t')
        const typeMap: Record<string, 'created' | 'modified' | 'deleted'> = {
          A: 'created',
          M: 'modified',
          D: 'deleted'
        }
        return { path, type: typeMap[status] || 'modified' }
      }).filter((f) => f.path)
    } catch {
      return []
    }
  }

  // --- Dev server management ---

  // Allowlist for dev server commands — prevents arbitrary command execution
  private static readonly ALLOWED_DEV_COMMANDS = [
    /^(?:pnpm|npm)\s+(?:run\s+)?(?:dev|start|serve|preview)$/,
    /^yarn\s+(?:dev|start|serve|preview)$/,
    /^npx\s+(?:vite|next\s+dev|nuxt\s+dev|remix\s+dev|astro\s+dev)$/,
    /^node\s+\S+\.(?:js|mjs|cjs)$/,
    /^bun\s+(?:run\s+)?(?:dev|start|serve)$/,
  ]

  async startDevServer(command: string): Promise<void> {
    const trimmed = command.trim()
    const isAllowed = AgentOrchestrator.ALLOWED_DEV_COMMANDS.some((re) => re.test(trimmed))
    if (!isAllowed) {
      throw new Error(`Command not allowed: "${trimmed}". Only standard dev server commands are permitted.`)
    }

    // Check for dangerous patterns even in whitelisted commands
    const guardResult = this.commandGuard.check(trimmed)
    if (guardResult.dangerous) {
      const approved = await this.commandGuard.requestApproval(trimmed, guardResult.reason)
      if (!approved) {
        throw new Error(`Command blocked: ${guardResult.reason}`)
      }
    }

    if (this.devServerProcess) {
      this.devServerProcess.kill('SIGTERM')
    }

    const args = trimmed.split(' ')
    const cmd = args.shift()!
    const proc = spawn(cmd, args, {
      cwd: this.getCwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getSafeEnv(),
    })

    this.devServerProcess = proc

    proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.emit('dev-server:output', line)
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.emit('dev-server:output', line)
      }
    })

    proc.on('close', () => {
      this.devServerProcess = null
      this.emit('dev-server:output', '[server exited]')
    })
  }

  stopDevServer(): void {
    if (this.devServerProcess) {
      this.devServerProcess.kill('SIGTERM')
      this.devServerProcess = null
    }
  }

  // --- GitHub integration ---

  checkGitHub(): { authenticated: boolean; username: string | null } {
    try {
      const output = execFileSync('gh', ['auth', 'status'], {
        stdio: 'pipe',
        timeout: 10_000
      }).toString()
      // gh auth status outputs "Logged in to github.com account USERNAME"
      const match = output.match(/account\s+(\S+)/)
      return { authenticated: true, username: match ? match[1] : null }
    } catch (err) {
      // gh auth status exits non-zero when not logged in, but prints to stderr
      const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : ''
      const match = stderr.match(/account\s+(\S+)/)
      if (match) return { authenticated: true, username: match[1] }
      return { authenticated: false, username: null }
    }
  }

  getGitRemote(): string | null {
    try {
      const cwd = this.getCwd()
      return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, stdio: 'pipe' }).toString().trim() || null
    } catch {
      return null
    }
  }

  gitPush(): { success: boolean; output: string } {
    try {
      const cwd = this.getCwd()
      const result = spawnSync('git', ['push'], { cwd, stdio: 'pipe', timeout: 30_000 })
      const out = (result.stdout?.toString() || '') + (result.stderr?.toString() || '')
      return { success: result.status === 0, output: out.slice(-500) || 'Pushed successfully' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, output: msg.slice(-500) }
    }
  }

  // --- Quick actions ---

  runQuickAction(action: string): { success: boolean; output: string } {
    const cwd = this.getCwd()
    try {
      switch (action) {
        case 'commit': {
          execFileSync('git', ['add', '-A'], { cwd, stdio: 'pipe' })
          const status = execFileSync('git', ['status', '--porcelain'], { cwd, stdio: 'pipe' }).toString().trim()
          if (!status) return { success: true, output: 'Nothing to commit' }
          execFileSync('git', ['commit', '-m', 'vibσ: auto-commit'], { cwd, stdio: 'pipe' })
          return { success: true, output: 'Changes committed' }
        }
        case 'test': {
          const result = spawnSync('pnpm', ['test'], { cwd, stdio: 'pipe', timeout: 60_000 })
          const out = (result.stdout?.toString() || '') + (result.stderr?.toString() || '')
          return { success: result.status === 0, output: out.slice(-500) }
        }
        case 'push': {
          return this.gitPush()
        }
        case 'run': {
          this.startDevServer('pnpm dev')
          return { success: true, output: 'Dev server starting...' }
        }
        default:
          return { success: false, output: `Unknown action: ${action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, output: msg.slice(-500) }
    }
  }

  // --- Intelligence Layer ---

  /** Refresh all intelligence modules for the current cwd. */
  private refreshIntelligence(): void {
    const cwd = this.getCwd()
    this.projectProfile = profileProject(cwd)
    this.contextFilter = ContextFilter.load(cwd)
    // Start LSP in background (non-blocking)
    this.lspBridge.startServer(cwd).catch((err) => {
      console.warn('[VIBE:Orchestrator] LSP start failed (non-fatal):', err)
    })
  }

  /** Build the intelligence context object for SessionManager. */
  private getIntelligenceContext(): { projectProfile?: string; diagnostics?: string; exclusions?: string } {
    const ctx: { projectProfile?: string; diagnostics?: string; exclusions?: string } = {}

    if (this.projectProfile) {
      const clause = profileToSystemPromptClause(this.projectProfile)
      if (clause) ctx.projectProfile = clause
    }

    const diagSummary = this.lspBridge.getDiagnosticsSummary()
    if (diagSummary) ctx.diagnostics = diagSummary

    const exclusionClause = this.contextFilter.toSystemPromptClause()
    if (exclusionClause) ctx.exclusions = exclusionClause

    return ctx
  }

  getProjectProfile(): ProjectProfile | null {
    return this.projectProfile
  }

  getLspStatus(): { running: boolean; language: LspLanguage | null; diagnosticCount: number } {
    return this.lspBridge.getStatus()
  }

  getDiagnosticsSummary(): string {
    return this.lspBridge.getDiagnosticsSummary()
  }

  getIgnorePatterns(): string[] {
    return this.contextFilter.getPatterns()
  }

  getActiveProject(): string | null {
    const cwd = this.getCwd()
    return cwd.split('/').pop() ?? null
  }

  switchProject(name: string): { success: boolean } {
    const workspaceDir = dirname(process.cwd())
    const targetPath = join(workspaceDir, name)
    try {
      const stat = statSync(targetPath)
      if (!stat.isDirectory()) return { success: false }
      // Verify it's a git project
      statSync(join(targetPath, '.git'))
      process.chdir(targetPath)
      // Refresh intelligence for the new project
      this.refreshIntelligence()
      return { success: true }
    } catch {
      return { success: false }
    }
  }

  getProjects(): Array<{ name: string; branch: string }> {
    const workspaceDir = dirname(process.cwd())
    const projects: Array<{ name: string; branch: string }> = []
    try {
      const entries = readdirSync(workspaceDir)
      for (const entry of entries) {
        const fullPath = join(workspaceDir, entry)
        try {
          const gitPath = join(fullPath, '.git')
          if (statSync(fullPath).isDirectory() && statSync(gitPath).isDirectory()) {
            let branch = 'unknown'
            try {
              const head = readFileSync(join(gitPath, 'HEAD'), 'utf8').trim()
              branch = head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 8)
            } catch { /* ignore */ }
            projects.push({ name: entry, branch })
          }
        } catch {
          // no .git or not a directory
        }
      }
    } catch {
      // workspace dir not readable
    }
    return projects
  }

  // --- Chat mode (SDK-native persistent sessions) ---

  async submitChat(text: string, options?: { allowedTools?: string[]; maxTurns?: number }): Promise<void> {
    if (!text || typeof text !== 'string') throw new Error('Chat text must be a non-empty string')
    const sanitized = text.trim().slice(0, MAX_INTENT_LENGTH)
    if (!sanitized) throw new Error('Chat text is empty after sanitization')

    // Determine if current model uses a non-Anthropic provider
    const modelId = this.currentModel
    const isNonAnthropic = modelId ? (getModelById(modelId)?.provider !== 'anthropic') : false

    if (isNonAnthropic && modelId) {
      // Non-Anthropic provider — use lightweight streaming chat
      if (this.sessionManager.hasNonAnthropicSession()) {
        try {
          await this.sessionManager.sendNonAnthropicMessage(sanitized)
          return
        } catch {
          console.log('[VIBE:Orchestrator] Non-Anthropic chat session lost, reinitializing...')
        }
      }
      await this.sessionManager.initNonAnthropicChat({
        prompt: sanitized,
        cwd: this.getCwd(),
        model: modelId,
        intelligence: this.getIntelligenceContext(),
      })
      return
    }

    // Anthropic provider — use existing SDK path
    if (this.sessionManager.hasChatSession()) {
      // Persistent session alive — push message instantly (sub-second)
      try {
        await this.sessionManager.sendChatMessage(sanitized)
        return
      } catch {
        // Session died — fall through to reinit with resume
        console.log('[VIBE:Orchestrator] Chat session lost, reinitializing...')
      }
    }

    // Initialize new session (or resume previous)
    const savedSessionId = this.sessionManager.getChatSessionId()
    await this.sessionManager.initChatSession({
      prompt: sanitized,
      cwd: this.getCwd(),
      allowedTools: options?.allowedTools,
      model: this.currentModel,
      resume: savedSessionId || undefined,
      intelligence: this.getIntelligenceContext(),
    })
  }

  cancelChat(): void {
    this.sessionManager.cancelChat()
    this.sessionManager.cancelNonAnthropicChat()
  }

  clearChatSession(): void {
    this.sessionManager.clearChat()
    this.sessionManager.clearNonAnthropicChat()
  }

  setModel(model: string): void {
    this.currentModel = model === 'default' ? undefined : model
    this.sessionManager.setModel(model)
  }

  private async runArchitect(intent: string): Promise<AgentTask[]> {
    console.log('[VIBE:Architect] spawning architect for:', intent)

    this.emitEvent({ type: 'architect:thinking', content: 'Decomposing task...' })

    // SDK-native one-shot query — no tools, Sonnet model, single turn
    const resultText = await this.sessionManager.runArchitect(intent, ARCHITECT_SYSTEM_PROMPT)

    console.log('[VIBE:Architect] resultText:', resultText.slice(0, 500))

    const parsed = this.parseTaskArray(resultText)
    const capped = parsed.slice(0, MAX_TASKS_PER_INTENT)
    const validIds = new Set(capped.map((t) => t.id))
    const tasks: AgentTask[] = capped.map((t) => ({
      id: t.id,
      description: String(t.description || '').slice(0, 2000),
      type: t.type || 'code',
      status: 'pending' as const,
      agent: 'worker' as const,
      dependencies: (t.dependencies || []).filter((d: string) => validIds.has(d))
    }))
    console.log('[VIBE:Architect] parsed tasks:', tasks.length)
    return tasks
  }

  private parseTaskArray(text: string): Array<{ id: string; description: string; type: AgentTask['type']; dependencies: string[] }> {
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        return JSON.parse(match[0])
      }
      throw new Error('No JSON array found in output')
    }
  }

  private scheduleNext(): void {
    try {
      if (this.runningCount >= this.concurrencyLimit) return

      for (const task of this.tasks.values()) {
        if (task.status !== 'pending') continue
        if (this.runningCount >= this.concurrencyLimit) break

        const depsResolved = task.dependencies.every((depId) => {
          const dep = this.tasks.get(depId)
          return dep && dep.status === 'completed'
        })

        const depsFailed = task.dependencies.some((depId) => {
          const dep = this.tasks.get(depId)
          return dep && dep.status === 'failed'
        })

        if (depsFailed) {
          task.status = 'failed'
          task.completedAt = Date.now()
          this.emitEvent({ type: 'task:failed', task, error: 'Dependency failed' })
          continue
        }

        if (depsResolved) {
          this.runWorker(task)
        }
      }
    } catch (err) {
      console.error('[VIBE:Orchestrator] scheduleNext error:', err)
      this.emitEvent({ type: 'chat:error', error: `Scheduler error: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  private runWorker(task: AgentTask): void {
    task.status = 'running'
    task.startedAt = Date.now()
    this.runningCount++
    this.emitEvent({ type: 'task:started', task })

    const allowedTools: string[] | undefined = this.currentPermissions.skipPermissions
      ? undefined
      : (() => {
          const tools: string[] = []
          if (this.currentPermissions.files) tools.push('Read', 'Write', 'Edit')
          if (this.currentPermissions.terminal) tools.push('Bash')
          if (this.currentPermissions.search) tools.push('Glob', 'Grep')
          return tools.length > 0 ? tools : undefined
        })()

    // SDK-native worker — streams progress events via SessionManager
    this.sessionManager.runWorker(task.id, {
      prompt: task.description,
      cwd: this.getCwd(),
      maxTurns: this.maxTurns,
      allowedTools,
      intelligence: this.getIntelligenceContext(),
    }).then((output) => {
      this.runningCount--
      task.status = 'completed'
      task.output = output
      task.completedAt = Date.now()
      this.emitEvent({ type: 'task:completed', task })
      this.scheduleNext()
    }).catch((err) => {
      this.runningCount--
      task.status = 'failed'
      task.completedAt = Date.now()
      const errMsg = err instanceof Error ? err.message : String(err)
      this.emitEvent({ type: 'task:failed', task, error: errMsg })
      this.scheduleNext()
    })
  }

  destroy(): void {
    this.sessionManager.destroy()
    this.commandGuard.destroy()
    this.lspBridge.destroy()
    this.stopDevServer()
    for (const [, proc] of this.processes) {
      proc.kill('SIGTERM')
    }
    this.processes.clear()
  }

  private emitEvent(event: AgentEvent): void {
    this.emit('event', event)
  }
}

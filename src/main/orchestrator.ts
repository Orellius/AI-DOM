import { EventEmitter } from 'events'
import { ChildProcess, spawn, execFileSync, spawnSync } from 'child_process'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { ClaudeCli } from './claude-cli'

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
  | { type: 'chat:error'; error: string }

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

  getCwd(): string {
    return process.cwd()
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
      return {
        id: `snap-${Date.now()}`,
        intent,
        timestamp: Date.now(),
        commitHash: hash
      }
    } catch {
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

  startDevServer(command: string): void {
    if (this.devServerProcess) {
      this.devServerProcess.kill('SIGTERM')
    }

    const args = command.split(' ')
    const cmd = args.shift()!
    const proc = spawn(cmd, args, {
      cwd: this.getCwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
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
        env: { ...process.env },
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

  // --- Chat mode ---

  submitChat(text: string, options?: { allowedTools?: string[]; maxTurns?: number }): void {
    if (!text || typeof text !== 'string') throw new Error('Chat text must be a non-empty string')
    const sanitized = text.trim().slice(0, MAX_INTENT_LENGTH)
    if (!sanitized) throw new Error('Chat text is empty after sanitization')

    // Kill any running chat process
    if (this.chatProcess) {
      this.chatProcess.kill('SIGTERM')
      this.chatProcess = null
    }

    const isResume = !!this.chatSessionId
    if (!this.chatSessionId) {
      this.chatSessionId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }

    const cli = new ClaudeCli()

    cli.on('system', (event: { subtype: string; session_id?: string }) => {
      if (event.subtype === 'init' && event.session_id) {
        this.chatSessionId = event.session_id
        this.emitEvent({ type: 'chat:session', sessionId: event.session_id })
      }
    })

    cli.on('assistant', (event: { message: { content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> } }) => {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          this.emitEvent({ type: 'chat:text', content: block.text })
        }
        if (block.type === 'tool_use' && block.name) {
          this.emitEvent({
            type: 'chat:tool-use',
            name: block.name,
            input: JSON.stringify(block.input ?? {}, null, 2)
          })
        }
      }
    })

    cli.on('close', () => {
      this.chatProcess = null
      this.emitEvent({ type: 'chat:done' })
    })

    cli.on('error', (err: Error) => {
      this.chatProcess = null
      this.emitEvent({ type: 'chat:error', error: err.message })
    })

    this.chatProcess = cli.runChat({
      text: sanitized,
      sessionId: this.chatSessionId,
      isResume,
      allowedTools: options?.allowedTools,
      maxTurns: options?.maxTurns ?? this.maxTurns
    })
  }

  cancelChat(): void {
    if (this.chatProcess) {
      this.chatProcess.kill('SIGTERM')
      this.chatProcess = null
      this.emitEvent({ type: 'chat:done' })
    }
  }

  clearChatSession(): void {
    this.cancelChat()
    this.chatSessionId = null
  }

  private async runArchitect(intent: string): Promise<AgentTask[]> {
    console.log('[VIBE:Architect] spawning architect for:', intent)
    const cli = new ClaudeCli()

    return new Promise((resolve, reject) => {
      let resultText = ''

      cli.on('assistant', (event: { message: { content: Array<{ type: string; text?: string }> } }) => {
        console.log('[VIBE:Architect] got assistant event, blocks:', event.message.content.length)
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            console.log('[VIBE:Architect] text block:', block.text.slice(0, 200))
            this.emitEvent({ type: 'architect:thinking', content: block.text })
            resultText += block.text
          }
        }
      })

      cli.on('result', (event: { result: string }) => {
        console.log('[VIBE:Architect] got result event:', String(event.result).slice(0, 300))
        resultText = event.result || resultText
      })

      cli.on('close', (code: number | null) => {
        console.log('[VIBE:Architect] process closed with code:', code)
        console.log('[VIBE:Architect] resultText:', resultText.slice(0, 500))
        try {
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
          resolve(tasks)
        } catch (err) {
          console.error('[VIBE:Architect] parse FAILED:', err, 'raw:', resultText.slice(0, 500))
          reject(new Error(`Failed to parse architect output: ${err}`))
        }
      })

      cli.on('error', (err: Error) => {
        console.error('[VIBE:Architect] error event:', err)
        reject(err)
      })

      console.log('[VIBE:Architect] calling cli.run() with prompt:', intent.slice(0, 100))
      cli.run({
        prompt: intent,
        systemPrompt: ARCHITECT_SYSTEM_PROMPT,
        outputFormat: 'stream-json',
        maxTurns: 1
      })
      console.log('[VIBE:Architect] cli.run() returned (process spawned)')
    })
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
  }

  private runWorker(task: AgentTask): void {
    task.status = 'running'
    task.startedAt = Date.now()
    this.runningCount++
    this.emitEvent({ type: 'task:started', task })

    const cli = new ClaudeCli()
    let output = ''

    cli.on('assistant', (event: { message: { content: Array<{ type: string; text?: string; name?: string }> } }) => {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          output += block.text
          this.emitEvent({ type: 'task:progress', taskId: task.id, content: block.text })
        }
        if (block.type === 'tool_use' && block.name) {
          task.toolInUse = block.name
          this.emitEvent({ type: 'task:progress', taskId: task.id, content: '', toolInUse: block.name })
        }
      }
    })

    cli.on('close', (code: number | null) => {
      this.processes.delete(task.id)
      this.runningCount--

      if (code === 0) {
        task.status = 'completed'
        task.output = output
        task.completedAt = Date.now()
        this.emitEvent({ type: 'task:completed', task })
      } else {
        task.status = 'failed'
        task.completedAt = Date.now()
        this.emitEvent({ type: 'task:failed', task, error: `Process exited with code ${code}` })
      }

      this.scheduleNext()
    })

    cli.on('error', (err: Error) => {
      this.processes.delete(task.id)
      this.runningCount--
      task.status = 'failed'
      task.completedAt = Date.now()
      this.emitEvent({ type: 'task:failed', task, error: err.message })
      this.scheduleNext()
    })

    const allowedTools: string[] | undefined = this.currentPermissions.skipPermissions
      ? undefined
      : (() => {
          const tools: string[] = []
          if (this.currentPermissions.files) tools.push('Read', 'Write', 'Edit')
          if (this.currentPermissions.terminal) tools.push('Bash')
          if (this.currentPermissions.search) tools.push('Glob', 'Grep')
          return tools.length > 0 ? tools : undefined
        })()

    const proc = cli.run({
      prompt: task.description,
      outputFormat: 'stream-json',
      maxTurns: this.maxTurns,
      allowedTools
    })

    this.processes.set(task.id, proc)
  }

  private emitEvent(event: AgentEvent): void {
    this.emit('event', event)
  }
}

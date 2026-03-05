import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, statSync } from 'fs'
import { resolve } from 'path'

// --- Security constants ---

const MAX_PROMPT_LENGTH = 50_000
const MAX_SYSTEM_PROMPT_LENGTH = 10_000
const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024 // 10MB
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000 // 5 min per CLI call
const LOGIN_TIMEOUT_MS = 2 * 60 * 1000 // 2 min for login flow
const AUTH_CHECK_TIMEOUT_MS = 15_000
const ALLOWED_TOOL_NAMES = new Set(['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'])
const ALLOWED_OUTPUT_FORMATS = new Set(['json', 'stream-json'])
const MAX_TURNS_LIMIT = 25

// --- Core guardrails: injected into every CLI call as system prompt ---
// These apply EVEN in bypass permissions mode to protect the user's system.
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
- Fork bombs: :(){ :|:& };: or equivalents
- Overwriting MBR/GPT/boot sectors

NETWORK DESTRUCTION:
- iptables -F (flush all rules without backup), pfctl -F all
- Deleting network configurations system-wide

DATA EXFILTRATION:
- Sending credentials, keys, or tokens to external URLs
- Reading and transmitting SSH keys, .env files, or auth tokens to any remote host

If the user asks for any of the above, REFUSE and explain why.
You MAY: delete project files the user asks about, rm specific files, modify project configs, run build/test commands, use git, etc. — normal development operations are fine.`

// Minimal safe env — only what claude CLI needs
function getSafeEnv(): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    SHELL: process.env.SHELL,
    LANG: process.env.LANG,
    TERM: process.env.TERM,
    // Claude CLI auth tokens live in ~/.claude — accessed via HOME
  }
}

export interface ClaudeCliOptions {
  prompt: string
  systemPrompt?: string
  outputFormat: 'json' | 'stream-json'
  allowedTools?: string[]
  maxTurns?: number
  cwd?: string
  timeoutMs?: number
  dangerouslySkipPermissions?: boolean
}

export interface ClaudeInitEvent {
  type: 'system'
  subtype: 'init'
  session_id: string
  tools: unknown[]
}

export interface ClaudeAssistantEvent {
  type: 'assistant'
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    >
  }
}

export interface ClaudeResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  result: string
  session_id: string
}

export type ClaudeStreamEvent = ClaudeInitEvent | ClaudeAssistantEvent | ClaudeResultEvent

export interface ChatOptions {
  text: string
  sessionId: string
  isResume: boolean
  allowedTools?: string[]
  maxTurns?: number
  cwd?: string
  timeoutMs?: number
  dangerouslySkipPermissions?: boolean
}

export class ClaudeCli extends EventEmitter {
  private process: ChildProcess | null = null
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null

  static async checkConnectivity(): Promise<{ connected: boolean; version: string | null }> {
    try {
      const output = await ClaudeCli.execSpawn(['--version'], AUTH_CHECK_TIMEOUT_MS)
      return { connected: true, version: output.trim() || null }
    } catch {
      return { connected: false, version: null }
    }
  }

  static async checkAuth(): Promise<{ installed: boolean; authenticated: boolean }> {
    // Step 1: Check if CLI binary exists (fast — no network)
    try {
      await ClaudeCli.execSpawn(['--version'], 5_000)
    } catch {
      return { installed: false, authenticated: false }
    }

    // Step 2: Check for auth config files instead of making an API call.
    // claude stores credentials in ~/.claude/ — if the dir has auth artifacts, assume authenticated.
    // If auth is actually expired, the first real intent call will fail and we handle it then.
    try {
      const { existsSync: exists } = await import('fs')
      const { join } = await import('path')
      const home = process.env.HOME || ''
      const claudeDir = join(home, '.claude')
      if (exists(claudeDir)) {
        return { installed: true, authenticated: true }
      }
      return { installed: true, authenticated: false }
    } catch {
      // If we can't check files, optimistically assume authenticated
      return { installed: true, authenticated: true }
    }
  }

  /**
   * Spawn `claude login` — opens browser for OAuth.
   * Resolves when the process exits. Timeout prevents zombie.
   */
  static async startLogin(): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['login'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getSafeEnv()
      })

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM')
        resolve({ success: false })
      }, LOGIN_TIMEOUT_MS)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        resolve({ success: code === 0 })
      })
      proc.on('error', () => {
        clearTimeout(timeout)
        resolve({ success: false })
      })
    })
  }

  private static execSpawn(args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getSafeEnv()
      })

      let stdout = ''
      let stderr = ''
      let outputSize = 0

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM')
        reject(new Error('Command timed out'))
      }, timeoutMs)

      proc.stdout?.on('data', (data: Buffer) => {
        outputSize += data.length
        if (outputSize > MAX_OUTPUT_BUFFER) {
          proc.kill('SIGTERM')
          reject(new Error('Output exceeded maximum buffer size'))
          return
        }
        stdout += data.toString()
      })
      proc.stderr?.on('data', (data: Buffer) => {
        outputSize += data.length
        if (outputSize > MAX_OUTPUT_BUFFER) {
          proc.kill('SIGTERM')
          reject(new Error('Output exceeded maximum buffer size'))
          return
        }
        stderr += data.toString()
      })
      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) resolve(stdout.trim())
        else reject(new Error(stderr || `claude exited with code ${code}`))
      })
      proc.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  /**
   * Validate and sanitize options before spawning.
   * Throws on invalid input — prevents injection.
   */
  private static validateOptions(options: ClaudeCliOptions): void {
    if (!options.prompt || typeof options.prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string')
    }
    if (options.prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`)
    }
    if (options.systemPrompt && options.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
      throw new Error(`System prompt exceeds maximum length of ${MAX_SYSTEM_PROMPT_LENGTH} characters`)
    }
    if (!ALLOWED_OUTPUT_FORMATS.has(options.outputFormat)) {
      throw new Error(`Invalid output format: ${options.outputFormat}`)
    }
    if (options.maxTurns !== undefined) {
      if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1 || options.maxTurns > MAX_TURNS_LIMIT) {
        throw new Error(`maxTurns must be an integer between 1 and ${MAX_TURNS_LIMIT}`)
      }
    }
    if (options.allowedTools) {
      for (const tool of options.allowedTools) {
        if (!ALLOWED_TOOL_NAMES.has(tool)) {
          throw new Error(`Tool "${tool}" is not in the allowed set`)
        }
      }
    }
    if (options.cwd) {
      const resolved = resolve(options.cwd)
      if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
        throw new Error(`Working directory does not exist: ${resolved}`)
      }
    }
  }

  run(options: ClaudeCliOptions): ChildProcess {
    ClaudeCli.validateOptions(options)
    console.log('[VIBE:CLI] run() called, prompt:', options.prompt.slice(0, 100), 'format:', options.outputFormat)

    const args = ['-p', options.prompt, '--output-format', options.outputFormat, '--verbose']

    // Always inject guardrail system prompt, prepend to user's system prompt if any
    const fullSystemPrompt = options.systemPrompt
      ? GUARDRAIL_SYSTEM_PROMPT + '\n\n' + options.systemPrompt
      : GUARDRAIL_SYSTEM_PROMPT
    args.push('--system-prompt', fullSystemPrompt)
    if (options.maxTurns !== undefined) {
      args.push('--max-turns', String(options.maxTurns))
    }
    if (options.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    } else if (options.allowedTools) {
      for (const tool of options.allowedTools) {
        args.push('--allowedTools', tool)
      }
    }

    return this._spawnAndWire(args, options.cwd, options.timeoutMs)
  }

  runChat(options: ChatOptions): ChildProcess {
    if (!options.text || typeof options.text !== 'string') {
      throw new Error('Chat text must be a non-empty string')
    }
    if (options.text.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Chat text exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`)
    }
    if (!options.sessionId || typeof options.sessionId !== 'string') {
      throw new Error('sessionId is required')
    }

    console.log('[VIBE:CLI] runChat() called, resume:', options.isResume, 'session:', options.sessionId)

    const args = ['-p', options.text, '--output-format', 'stream-json', '--verbose',
      '--system-prompt', GUARDRAIL_SYSTEM_PROMPT]

    if (options.isResume) {
      args.push('--resume', options.sessionId)
    } else {
      args.push('--session-id', options.sessionId)
    }

    if (options.maxTurns !== undefined) {
      if (Number.isInteger(options.maxTurns) && options.maxTurns >= 1 && options.maxTurns <= MAX_TURNS_LIMIT) {
        args.push('--max-turns', String(options.maxTurns))
      }
    }
    if (options.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    } else if (options.allowedTools) {
      for (const tool of options.allowedTools) {
        if (ALLOWED_TOOL_NAMES.has(tool)) {
          args.push('--allowedTools', tool)
        }
      }
    }

    return this._spawnAndWire(args, options.cwd, options.timeoutMs)
  }

  private _spawnAndWire(args: string[], cwd?: string, timeoutMs?: number): ChildProcess {
    console.log('[VIBE:CLI] spawning: claude', args.map((a, i) => i === 1 ? a.slice(0, 50) + '...' : a).join(' '))
    const proc = spawn('claude', args, {
      cwd: cwd ? resolve(cwd) : undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getSafeEnv()
    })
    console.log('[VIBE:CLI] process spawned, pid:', proc.pid)

    this.process = proc
    let buffer = ''
    let totalOutputSize = 0
    const timeout = timeoutMs ?? PROCESS_TIMEOUT_MS

    this.timeoutHandle = setTimeout(() => {
      this.kill()
      this.emit('error', new Error('Process timed out'))
    }, timeout)

    proc.stdout?.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString()
      console.log('[VIBE:CLI] stdout chunk (' + chunk.length + ' bytes):', chunkStr.slice(0, 200))
      totalOutputSize += chunk.length
      if (totalOutputSize > MAX_OUTPUT_BUFFER) {
        this.kill()
        this.emit('error', new Error('Output exceeded maximum buffer size'))
        return
      }

      buffer += chunkStr
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as ClaudeStreamEvent
          console.log('[VIBE:CLI] parsed event type:', parsed.type)
          this.emit('event', parsed)
          this.emit(parsed.type, parsed)
        } catch {
          console.log('[VIBE:CLI] non-JSON line:', trimmed.slice(0, 100))
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const stderrStr = chunk.toString()
      console.warn('[VIBE:CLI] stderr:', stderrStr.slice(0, 300))
      totalOutputSize += chunk.length
      if (totalOutputSize > MAX_OUTPUT_BUFFER) {
        this.kill()
        this.emit('error', new Error('Stderr exceeded maximum buffer size'))
        return
      }
      if (stderrStr.includes('Error') || stderrStr.includes('error:') || stderrStr.includes('ENOENT')) {
        this.emit('error', new Error(stderrStr))
      }
    })

    proc.on('close', (code) => {
      console.log('[VIBE:CLI] process closed, code:', code)
      this.clearTimeout()
      if (buffer.trim()) {
        console.log('[VIBE:CLI] flushing remaining buffer:', buffer.trim().slice(0, 200))
        try {
          const parsed = JSON.parse(buffer.trim()) as ClaudeStreamEvent
          this.emit('event', parsed)
          this.emit(parsed.type, parsed)
        } catch {
          console.log('[VIBE:CLI] remaining buffer not JSON')
        }
      }
      this.process = null
      this.emit('close', code)
    })

    proc.on('error', (err) => {
      console.error('[VIBE:CLI] process error event:', err)
      this.clearTimeout()
      this.emit('error', err)
    })

    return proc
  }

  kill(): void {
    this.clearTimeout()
    this.process?.kill('SIGTERM')
    this.process = null
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
  }
}

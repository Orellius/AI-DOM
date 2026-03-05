import { EventEmitter } from 'events'
import { ChildProcess, spawn, execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

// --- LSP Types ---

export type LspLanguage = 'typescript' | 'javascript' | 'rust' | 'go' | 'python'

interface LspDiagnostic {
  file: string
  line: number
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
}

interface LspServerConfig {
  command: string
  args: string[]
  initOptions?: Record<string, unknown>
}

// LSP severity: 1=Error, 2=Warning, 3=Info, 4=Hint
const SEVERITY_MAP: Record<number, LspDiagnostic['severity']> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
}

const SERVER_CONFIGS: Record<LspLanguage, LspServerConfig> = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  javascript: { command: 'typescript-language-server', args: ['--stdio'] },
  rust: { command: 'rust-analyzer', args: [] },
  go: { command: 'gopls', args: ['serve'] },
  python: { command: 'pyright-langserver', args: ['--stdio'] },
}

// --- JSON-RPC helpers ---

function encodeRpcMessage(obj: unknown): Buffer {
  const body = JSON.stringify(obj)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  return Buffer.from(header + body)
}

// --- LspBridge ---

export class LspBridge extends EventEmitter {
  private server: ChildProcess | null = null
  private language: LspLanguage | null = null
  private diagnosticsCache = new Map<string, LspDiagnostic[]>()
  private cwd: string
  private rpcId = 0
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private inputBuffer = ''
  private initialized = false

  constructor(cwd: string) {
    super()
    this.cwd = cwd
  }

  /** Detect the primary language of a project from file markers. */
  detectLanguage(cwd?: string): LspLanguage | null {
    const dir = cwd || this.cwd

    if (existsSync(join(dir, 'tsconfig.json'))) return 'typescript'
    if (existsSync(join(dir, 'package.json')) && !existsSync(join(dir, 'tsconfig.json'))) return 'javascript'
    if (existsSync(join(dir, 'Cargo.toml'))) return 'rust'
    if (existsSync(join(dir, 'go.mod'))) return 'go'
    if (existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'requirements.txt'))) return 'python'

    return null
  }

  /** Check if the LSP binary is available on PATH. */
  private isBinaryAvailable(command: string): boolean {
    try {
      execFileSync('which', [command], { stdio: 'pipe', timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /** Start the LSP server for the detected language. */
  async startServer(cwd?: string): Promise<void> {
    const dir = cwd || this.cwd
    this.cwd = dir

    const lang = this.detectLanguage(dir)
    if (!lang) {
      console.log('[VIBE:LSP] No language detected for', dir)
      return
    }

    const config = SERVER_CONFIGS[lang]
    if (!this.isBinaryAvailable(config.command)) {
      console.log(`[VIBE:LSP] ${config.command} not found, skipping LSP`)
      return
    }

    // Shutdown existing server if switching projects
    if (this.server) {
      this.destroy()
    }

    this.language = lang
    this.diagnosticsCache.clear()
    this.rpcId = 0
    this.pendingRequests.clear()
    this.inputBuffer = ''
    this.initialized = false

    console.log(`[VIBE:LSP] Starting ${config.command} for ${lang} in ${dir}`)

    const proc = spawn(config.command, config.args, {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.server = proc

    proc.stdout?.on('data', (chunk: Buffer) => {
      this.handleServerData(chunk.toString())
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      console.warn('[VIBE:LSP:stderr]', chunk.toString().slice(0, 300))
    })

    proc.on('error', (err) => {
      console.error('[VIBE:LSP] Server process error:', err.message)
      this.server = null
    })

    proc.on('close', (code) => {
      console.log(`[VIBE:LSP] Server exited with code ${code}`)
      this.server = null
      this.initialized = false
    })

    // Send initialize request
    await this.sendInitialize(dir)
  }

  /** Get the current server status. */
  getStatus(): { running: boolean; language: LspLanguage | null; diagnosticCount: number } {
    let diagnosticCount = 0
    for (const diags of this.diagnosticsCache.values()) {
      diagnosticCount += diags.length
    }
    return {
      running: this.server !== null && this.initialized,
      language: this.language,
      diagnosticCount,
    }
  }

  /**
   * Get a formatted diagnostics summary for prompt injection.
   * Only includes errors and warnings (skips info/hints).
   */
  getDiagnosticsSummary(maxLines = 30): string {
    const lines: string[] = []

    for (const [uri, diags] of this.diagnosticsCache) {
      for (const d of diags) {
        if (d.severity !== 'error' && d.severity !== 'warning') continue
        const relPath = d.file || uri
        lines.push(`${relPath}:${d.line} - ${d.severity}: ${d.message}`)
        if (lines.length >= maxLines) break
      }
      if (lines.length >= maxLines) break
    }

    if (lines.length === 0) return ''

    return 'CURRENT PROJECT DIAGNOSTICS:\n' + lines.join('\n')
  }

  /** Notify the LSP that a file was opened or changed (triggers fresh diagnostics). */
  notifyFileChanged(filePath: string, content?: string): void {
    if (!this.server || !this.initialized) return

    const uri = `file://${filePath}`
    const text = content || this.readFileSafe(filePath)
    if (text === null) return

    const languageId = this.getLanguageId(filePath)

    // Send didOpen (simplified — in a full impl we'd track open/change state)
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text,
      },
    })
  }

  /** Open key project files to trigger initial diagnostics. */
  openProjectFiles(): void {
    if (!this.server || !this.initialized) return

    const extensions = this.getFileExtensions()
    if (extensions.length === 0) return

    // Scan top-level src/ for files (shallow, cap at 20)
    const srcDir = join(this.cwd, 'src')
    const files = this.findFiles(existsSync(srcDir) ? srcDir : this.cwd, extensions, 20)

    for (const file of files) {
      this.notifyFileChanged(file)
    }
  }

  destroy(): void {
    if (this.server) {
      // Send shutdown request then exit notification
      try {
        this.sendRequest('shutdown', null).catch(() => {})
        setTimeout(() => {
          this.sendNotification('exit', null)
          this.server?.kill('SIGTERM')
        }, 500)
      } catch {
        this.server.kill('SIGTERM')
      }
      this.server = null
    }
    this.initialized = false
    this.diagnosticsCache.clear()
    this.pendingRequests.clear()
    this.inputBuffer = ''
  }

  // --- Private: JSON-RPC ---

  private async sendInitialize(rootPath: string): Promise<void> {
    const rootUri = `file://${rootPath}`

    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      rootPath,
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            relatedInformation: false,
          },
          synchronization: {
            didOpen: true,
            didChange: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      workspaceFolders: [{ uri: rootUri, name: rootPath.split('/').pop() || 'root' }],
    })

    // Send initialized notification
    this.sendNotification('initialized', {})
    this.initialized = true
    console.log('[VIBE:LSP] Server initialized')

    // Open key files to trigger diagnostics
    this.openProjectFiles()
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.server?.stdin?.writable) {
        reject(new Error('LSP server not running'))
        return
      }

      const id = ++this.rpcId
      const msg = { jsonrpc: '2.0', id, method, params }
      this.pendingRequests.set(id, { resolve, reject })

      try {
        this.server.stdin.write(encodeRpcMessage(msg))
      } catch (err) {
        this.pendingRequests.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }

      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`LSP request timed out: ${method}`))
        }
      }, 10_000)
    })
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.server?.stdin?.writable) return
    const msg = { jsonrpc: '2.0', method, params }
    try {
      this.server.stdin.write(encodeRpcMessage(msg))
    } catch {
      // Server died — ignore
    }
  }

  private handleServerData(data: string): void {
    this.inputBuffer += data

    while (true) {
      const headerEnd = this.inputBuffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const header = this.inputBuffer.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // Malformed — skip to next potential header
        this.inputBuffer = this.inputBuffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(match[1], 10)
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + contentLength

      if (this.inputBuffer.length < bodyEnd) break // Wait for more data

      const body = this.inputBuffer.slice(bodyStart, bodyEnd)
      this.inputBuffer = this.inputBuffer.slice(bodyEnd)

      try {
        const msg = JSON.parse(body)
        this.handleRpcMessage(msg)
      } catch {
        console.warn('[VIBE:LSP] Failed to parse JSON-RPC message')
      }
    }
  }

  private handleRpcMessage(msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown }): void {
    // Response to a request
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id)!
      this.pendingRequests.delete(msg.id)
      if (msg.error) {
        reject(new Error(JSON.stringify(msg.error)))
      } else {
        resolve(msg.result)
      }
      return
    }

    // Server notification
    if (msg.method === 'textDocument/publishDiagnostics') {
      this.handleDiagnostics(msg.params as { uri: string; diagnostics: Array<{ range: { start: { line: number } }; severity?: number; message: string }> })
    }
  }

  private handleDiagnostics(params: { uri: string; diagnostics: Array<{ range: { start: { line: number } }; severity?: number; message: string }> }): void {
    const { uri, diagnostics } = params
    const filePath = uri.startsWith('file://') ? uri.slice(7) : uri
    const relPath = relative(this.cwd, filePath)

    const mapped: LspDiagnostic[] = diagnostics.map((d) => ({
      file: relPath,
      line: d.range.start.line + 1, // LSP lines are 0-based
      severity: SEVERITY_MAP[d.severity ?? 1] || 'error',
      message: d.message,
    }))

    if (mapped.length === 0) {
      this.diagnosticsCache.delete(relPath)
    } else {
      this.diagnosticsCache.set(relPath, mapped)
    }

    this.emit('diagnostics', { file: relPath, diagnostics: mapped })
  }

  // --- Helpers ---

  private getLanguageId(filePath: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript'
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript'
    if (filePath.endsWith('.rs')) return 'rust'
    if (filePath.endsWith('.go')) return 'go'
    if (filePath.endsWith('.py')) return 'python'
    return 'plaintext'
  }

  private getFileExtensions(): string[] {
    switch (this.language) {
      case 'typescript': return ['.ts', '.tsx']
      case 'javascript': return ['.js', '.jsx']
      case 'rust': return ['.rs']
      case 'go': return ['.go']
      case 'python': return ['.py']
      default: return []
    }
  }

  private findFiles(dir: string, extensions: string[], maxFiles: number): string[] {
    const results: string[] = []
    const scan = (d: string, depth: number): void => {
      if (depth > 3 || results.length >= maxFiles) return
      try {
        const entries = readdirSync(d)
        for (const entry of entries) {
          if (results.length >= maxFiles) return
          if (entry.startsWith('.') || entry === 'node_modules' || entry === 'target' || entry === 'dist') continue
          const full = join(d, entry)
          try {
            const stat = statSync(full)
            if (stat.isDirectory()) {
              scan(full, depth + 1)
            } else if (extensions.some((ext) => entry.endsWith(ext))) {
              results.push(full)
            }
          } catch { /* skip unreadable */ }
        }
      } catch { /* skip unreadable */ }
    }
    scan(dir, 0)
    return results
  }

  private readFileSafe(filePath: string): string | null {
    try {
      return readFileSync(filePath, 'utf8')
    } catch {
      return null
    }
  }
}

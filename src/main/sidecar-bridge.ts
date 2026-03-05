import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createInterface, Interface } from 'readline'
import type { TranscriptionResult } from './voice-engine.js'

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * SidecarBridge manages the Rust vibe-audio sidecar process.
 * Communicates via JSON-RPC over stdin/stdout.
 *
 * Lifecycle: spawned lazily on first use, stays alive for the session,
 * killed on app quit. Auto-restarts on crash (max 3 retries).
 */
export class SidecarBridge {
  private proc: ChildProcess | null = null
  private rl: Interface | null = null
  private requestId = 0
  private pending: Map<number, PendingRequest> = new Map()
  private restartCount = 0
  private maxRestarts = 3
  private modelPath: string | null = null
  private language: string | null = null

  /**
   * Start the sidecar and initialize the whisper model.
   */
  async start(modelPath: string, language = 'auto'): Promise<void> {
    this.modelPath = modelPath
    this.language = language

    const binary = this.findBinary()
    if (!binary) {
      throw new Error('Sidecar binary (vibe-audio) not found')
    }

    this.proc = spawn(binary, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.proc.on('exit', (code) => {
      console.log(`[SidecarBridge] Process exited with code ${code}`)
      this.cleanup()

      // Auto-restart on unexpected exit
      if (code !== 0 && this.restartCount < this.maxRestarts && this.modelPath) {
        this.restartCount++
        console.log(`[SidecarBridge] Auto-restarting (attempt ${this.restartCount}/${this.maxRestarts})`)
        this.start(this.modelPath, this.language || 'auto').catch(console.error)
      }
    })

    this.proc.on('error', (err) => {
      console.error('[SidecarBridge] Process error:', err)
      this.rejectAll(err.message)
    })

    // Read JSON lines from stdout
    if (this.proc.stdout) {
      this.rl = createInterface({ input: this.proc.stdout })
      this.rl.on('line', (line) => this.handleLine(line))
    }

    // Log stderr for debugging
    if (this.proc.stderr) {
      this.proc.stderr.on('data', (data: Buffer) => {
        console.error('[SidecarBridge:stderr]', data.toString().trim())
      })
    }

    // Initialize model
    await this.request('init', { model_path: modelPath, language })
    this.restartCount = 0
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  async request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.proc || !this.proc.stdin) {
      throw new Error('Sidecar not running')
    }

    const id = ++this.requestId

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Sidecar request timed out: ${method}`))
      }, 60000) // 60s timeout for transcription

      this.pending.set(id, { resolve, reject, timeout })

      const msg = JSON.stringify({ id, method, params }) + '\n'
      this.proc!.stdin!.write(msg)
    })
  }

  /**
   * Transcribe audio buffer. Returns TranscriptionResult.
   */
  async transcribe(audioBuffer: Buffer, format = 'webm'): Promise<TranscriptionResult> {
    const audioBase64 = audioBuffer.toString('base64')
    const result = await this.request('transcribe', { audio_base64: audioBase64, format })

    return {
      text: result.text || '',
      language: result.language || 'en',
      duration: result.duration || 0,
      provider: 'sidecar',
    }
  }

  /**
   * Check voice activity in an audio buffer.
   */
  async checkVAD(audioBuffer: Buffer, threshold = 0.02): Promise<boolean> {
    const audioBase64 = audioBuffer.toString('base64')
    const result = await this.request('vad_check', { audio_base64: audioBase64, threshold })
    return result.has_speech
  }

  /**
   * Get sidecar status.
   */
  async status(): Promise<{ ready: boolean; uptime: number }> {
    const result = await this.request('status')
    return {
      ready: result.status === 'ready',
      uptime: result.uptime_secs || 0,
    }
  }

  /**
   * Gracefully shut down the sidecar.
   */
  async stop(): Promise<void> {
    if (!this.proc) return

    try {
      await this.request('shutdown')
    } catch {
      // If shutdown request fails, force kill
    }

    // Give it a moment to exit gracefully, then force kill
    setTimeout(() => {
      if (this.proc && !this.proc.killed) {
        this.proc.kill('SIGTERM')
      }
    }, 2000)
  }

  /**
   * Handle a JSON line from the sidecar stdout.
   */
  private handleLine(line: string): void {
    if (!line.trim()) return

    try {
      const response = JSON.parse(line)
      const pending = this.pending.get(response.id)
      if (!pending) return

      clearTimeout(pending.timeout)
      this.pending.delete(response.id)

      if (response.error) {
        pending.reject(new Error(response.error))
      } else {
        pending.resolve(response.result)
      }
    } catch (e) {
      console.error('[SidecarBridge] Failed to parse response:', line)
    }
  }

  /**
   * Find the sidecar binary in standard locations.
   */
  private findBinary(): string | null {
    const locations = [
      join(__dirname, '..', 'resources', 'bin', 'vibe-audio'),
      join(__dirname, '..', '..', 'src-sidecar', 'target', 'release', 'vibe-audio'),
      join(homedir(), '.vibeflow', 'bin', 'vibe-audio'),
    ]

    for (const loc of locations) {
      if (existsSync(loc)) return loc
    }
    return null
  }

  /**
   * Clean up after process exit.
   */
  private cleanup(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
    this.proc = null
    this.rejectAll('Sidecar process exited')
  }

  /**
   * Reject all pending requests.
   */
  private rejectAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(reason))
    }
    this.pending.clear()
  }
}

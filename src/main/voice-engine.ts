import { execFile } from 'child_process'
import {
  existsSync, mkdirSync, writeFileSync, unlinkSync,
  createWriteStream, readFileSync, renameSync, statSync
} from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { promisify } from 'util'
import https from 'https'
import http from 'http'

const execFileAsync = promisify(execFile)

export interface TranscriptionResult {
  text: string
  translatedText?: string
  language: string
  duration: number
  provider: 'local' | 'groq' | 'sidecar'
}

export interface VoiceConfig {
  preferredLanguage: string | null
  provider: 'auto' | 'local' | 'groq' | 'sidecar'
  groqApiKey: string | null
  autoTranslate: boolean
}

// Binary names to search for in PATH (brew installs as whisper-cli)
const WHISPER_BINARY_NAMES = ['whisper-cli', 'whisper-cpp', 'whisper']

export class VoiceEngine {
  private config: VoiceConfig = {
    preferredLanguage: null,
    provider: 'auto',
    groqApiKey: null,
    autoTranslate: true
  }

  private configDir = join(homedir(), '.vibeflow')
  private modelsDir = join(homedir(), '.vibeflow', 'models')
  private configPath = join(homedir(), '.vibeflow', 'voice-config.json')
  private resolvedBinary: string | null = null

  constructor() {
    if (!existsSync(this.configDir)) mkdirSync(this.configDir, { recursive: true })
    if (!existsSync(this.modelsDir)) mkdirSync(this.modelsDir, { recursive: true })

    // Load saved config
    try {
      if (existsSync(this.configPath)) {
        const saved = JSON.parse(readFileSync(this.configPath, 'utf-8'))
        this.config = { ...this.config, ...saved }
      }
    } catch { /* use defaults */ }

    // Resolve binary path on startup
    this.resolvedBinary = this.findWhisperBinary()
  }

  /**
   * Search for whisper binary in system PATH and common install locations.
   * Returns absolute path or null if not found.
   */
  private findWhisperBinary(): string | null {
    const { execSync } = require('child_process')

    // Check each candidate name in PATH
    for (const name of WHISPER_BINARY_NAMES) {
      try {
        const result = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf-8' }).trim()
        if (result && existsSync(result)) return result
      } catch { /* not found, try next */ }
    }

    // Check Homebrew locations explicitly (macOS)
    const brewPaths = [
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper-cpp',
      '/usr/local/bin/whisper-cpp',
    ]
    for (const p of brewPaths) {
      if (existsSync(p)) return p
    }

    // Check bundled binary (for packaged app distribution)
    const bundledPath = join(__dirname, '..', 'resources', 'bin', 'whisper-cpp')
    if (existsSync(bundledPath)) return bundledPath

    return null
  }

  checkLocalAvailability(): { available: boolean; modelDownloaded: boolean; binaryPath: string | null } {
    // Re-resolve binary each time (user may have installed it since startup)
    this.resolvedBinary = this.findWhisperBinary()

    const modelPath = join(this.modelsDir, 'ggml-large-v3-turbo-q5_0.bin')
    let modelDownloaded = false
    if (existsSync(modelPath)) {
      // Validate model file is not corrupt (check minimum size: 500MB)
      try {
        const stat = statSync(modelPath)
        modelDownloaded = stat.size > 500 * 1024 * 1024
      } catch {
        modelDownloaded = false
      }
    }

    return {
      available: this.resolvedBinary !== null,
      modelDownloaded,
      binaryPath: this.resolvedBinary
    }
  }

  async downloadModel(onProgress: (pct: number) => void): Promise<void> {
    const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin'
    const modelPath = join(this.modelsDir, 'ggml-large-v3-turbo-q5_0.bin')
    const tempPath = modelPath + '.tmp'

    // Clean up partial downloads
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath) } catch { /* ignore */ }
    }

    return new Promise((resolve, reject) => {
      const download = (url: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'))
          return
        }

        const protocol = url.startsWith('https') ? https : http
        protocol.get(url, { headers: { 'User-Agent': 'VIBE/1.0' } }, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            download(res.headers.location, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`))
            return
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0
          const file = createWriteStream(tempPath)

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            file.write(chunk)
            if (totalSize > 0) {
              onProgress(Math.round((downloaded / totalSize) * 100))
            }
          })

          res.on('end', () => {
            file.end(() => {
              // Validate downloaded file size
              try {
                const stat = statSync(tempPath)
                if (stat.size < 500 * 1024 * 1024) {
                  try { unlinkSync(tempPath) } catch { /* ignore */ }
                  reject(new Error(`Download incomplete: got ${(stat.size / 1024 / 1024).toFixed(0)}MB, expected ~547MB`))
                  return
                }
              } catch (e: any) {
                reject(new Error(`Failed to verify download: ${e.message}`))
                return
              }

              renameSync(tempPath, modelPath)
              resolve()
            })
          })

          res.on('error', (err: Error) => {
            file.end()
            try { unlinkSync(tempPath) } catch { /* ignore */ }
            reject(err)
          })
        }).on('error', reject)
      }

      download(modelUrl)
    })
  }

  /**
   * Transcribe audio. Accepts raw WebM/Opus from the renderer.
   * Conversion to WAV happens here in the main process using afconvert/ffmpeg.
   * If autoTranslate is enabled and the detected language is not English,
   * the result will include a translatedText field with the English translation.
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    // Gate: validate audio buffer
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Empty audio buffer')
    }
    if (audioBuffer.length < 100) {
      throw new Error('Audio too short to transcribe')
    }

    const provider = this.selectProvider()

    let result: TranscriptionResult

    if (provider === 'sidecar') {
      result = await this.transcribeSidecar(audioBuffer)
    } else if (provider === 'groq') {
      // Groq accepts WebM natively — no conversion needed
      result = await this.transcribeGroq(audioBuffer, 'audio/webm')
    } else {
      result = await this.transcribeLocal(audioBuffer)
    }

    // Auto-translate if enabled and source is not English
    if (this.config.autoTranslate && result.text.trim().length >= 3 && result.language !== 'en') {
      try {
        const translation = await this.translateToEnglish(result.text, result.language)
        result.translatedText = translation.translated
      } catch {
        // Translation failed — return original text without translation
      }
    }

    return result
  }

  /**
   * Translate text to English using Groq LLM.
   */
  async translateToEnglish(text: string, sourceLanguage: string): Promise<{
    translated: string
    sourceLanguage: string
    targetLanguage: 'en'
  }> {
    if (sourceLanguage === 'en' || text.length < 3) {
      return { translated: text, sourceLanguage, targetLanguage: 'en' }
    }

    if (!this.config.groqApiKey) {
      throw new Error('Groq API key required for translation')
    }

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'Translate the following text to English. Output only the translation, no explanation.'
        },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
      max_tokens: 2048,
    })

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        timeout: 15000,
        headers: {
          'Authorization': `Bearer ${this.config.groqApiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        }
      }, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`Translation API error (${res.statusCode})`))
              return
            }
            const json = JSON.parse(data)
            const translated = json.choices?.[0]?.message?.content?.trim()
            if (!translated) {
              reject(new Error('Empty translation response'))
              return
            }
            resolve({ translated, sourceLanguage, targetLanguage: 'en' })
          } catch (e: any) {
            reject(new Error(`Failed to parse translation response: ${e.message}`))
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Translation request timed out'))
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  /**
   * Transcribe using the Rust sidecar. Delegates to SidecarBridge.
   */
  private async transcribeSidecar(audioBuffer: Buffer): Promise<TranscriptionResult> {
    // Import dynamically to avoid circular deps at module load
    const { SidecarBridge } = await import('./sidecar-bridge.js')

    if (!this.sidecarBridge) {
      this.sidecarBridge = new SidecarBridge()
      const modelPath = join(this.modelsDir, 'ggml-large-v3-turbo-q5_0.bin')
      await this.sidecarBridge.start(modelPath, this.config.preferredLanguage || 'auto')
    }

    return this.sidecarBridge.transcribe(audioBuffer, 'webm')
  }

  private sidecarBridge: any = null

  /**
   * Convert WebM/Opus to 16kHz mono WAV using ffmpeg or macOS afconvert.
   * Returns path to the converted WAV file.
   */
  private async convertToWav(webmBuffer: Buffer): Promise<string> {
    const ts = Date.now()
    const tempWebm = join(tmpdir(), `vibe-input-${ts}.webm`)
    const tempWav = join(tmpdir(), `vibe-audio-${ts}.wav`)

    writeFileSync(tempWebm, webmBuffer)

    try {
      // Try ffmpeg first (most reliable for WebM/Opus)
      try {
        await execFileAsync('ffmpeg', [
          '-i', tempWebm,
          '-ar', '16000',    // 16kHz sample rate
          '-ac', '1',        // mono
          '-c:a', 'pcm_s16le', // 16-bit PCM
          '-y',              // overwrite
          tempWav
        ], { timeout: 30000 })

        if (existsSync(tempWav) && statSync(tempWav).size > 44) {
          return tempWav
        }
      } catch { /* ffmpeg not available, try afconvert */ }

      // macOS afconvert fallback — needs intermediate CAF step for WebM
      // afconvert can't read WebM directly, so try via afplay's internal decoder
      // Actually, use the macOS `afconvert` on a raw PCM intermediary
      // Since afconvert can't handle WebM, try sox
      try {
        await execFileAsync('sox', [
          tempWebm,
          '-r', '16000', '-c', '1', '-b', '16',
          tempWav
        ], { timeout: 30000 })

        if (existsSync(tempWav) && statSync(tempWav).size > 44) {
          return tempWav
        }
      } catch { /* sox not available */ }

      throw new Error(
        'Cannot convert audio: ffmpeg not found.\n' +
        'Install: brew install ffmpeg'
      )
    } finally {
      // Clean up WebM temp
      try { unlinkSync(tempWebm) } catch { /* ignore */ }
    }
  }

  private async transcribeLocal(webmBuffer: Buffer): Promise<TranscriptionResult> {
    // Gate: binary must exist
    const binary = this.resolvedBinary || this.findWhisperBinary()
    if (!binary) {
      throw new Error(
        'Whisper binary not found. Install via: brew install whisper-cpp\n' +
        'Or set a Groq API key in Settings for cloud transcription.'
      )
    }

    // Gate: model must exist and be valid
    const modelPath = join(this.modelsDir, 'ggml-large-v3-turbo-q5_0.bin')
    if (!existsSync(modelPath)) {
      throw new Error('Whisper model not downloaded. Go to Settings → Voice Input → Download.')
    }
    const modelStat = statSync(modelPath)
    if (modelStat.size < 500 * 1024 * 1024) {
      throw new Error('Whisper model file appears corrupt. Delete and re-download from Settings.')
    }

    // Convert WebM → WAV using ffmpeg (proper format, correct sample rate)
    const tempWav = await this.convertToWav(webmBuffer)
    const tempOutput = join(tmpdir(), `vibe-output-${Date.now()}`)

    try {
      // Gate: verify WAV file is valid
      if (!existsSync(tempWav) || statSync(tempWav).size < 44) {
        throw new Error('Audio conversion produced empty file')
      }

      const args = [
        '-m', modelPath,
        '-f', tempWav,
        '-oj',              // output JSON
        '-of', tempOutput,  // output file path (whisper appends .json)
        '-l', this.config.preferredLanguage || 'auto',
        '-t', '4',          // threads
        '-np',              // no prints (suppress progress)
      ]

      await execFileAsync(binary, args, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      })

      // Read JSON output file
      const jsonPath = tempOutput + '.json'
      if (!existsSync(jsonPath)) {
        throw new Error('Whisper produced no output. The audio may be too short or silent.')
      }

      const outputRaw = readFileSync(jsonPath, 'utf-8')
      let result: any
      try {
        result = JSON.parse(outputRaw)
      } catch {
        throw new Error('Failed to parse whisper output')
      }

      // Clean up output json
      try { unlinkSync(jsonPath) } catch { /* ignore */ }

      // Extract text from transcription segments
      let text = ''
      if (result.transcription && Array.isArray(result.transcription)) {
        text = result.transcription.map((s: any) => s.text).join(' ').trim()
      } else if (typeof result.text === 'string') {
        text = result.text.trim()
      }

      // Clean up output json
      try { unlinkSync(jsonPath) } catch { /* ignore */ }

      return {
        text,
        language: result.result?.language || this.config.preferredLanguage || 'en',
        duration: result.result?.duration || 0,
        provider: 'local'
      }
    } finally {
      // Always clean up temp wav
      try { unlinkSync(tempWav) } catch { /* ignore */ }
    }
  }

  private async transcribeGroq(audioBuffer: Buffer, mimeType = 'audio/wav'): Promise<TranscriptionResult> {
    // Gate: API key
    if (!this.config.groqApiKey) {
      throw new Error('Groq API key not configured. Add it in Settings → Voice Input.')
    }
    if (!this.config.groqApiKey.startsWith('gsk_')) {
      throw new Error('Invalid Groq API key format. Keys start with "gsk_".')
    }

    const boundary = '----VIBEFormBoundary' + Date.now().toString(36)
    const parts: Buffer[] = []

    const ext = mimeType === 'audio/webm' ? 'webm' : 'wav'
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    ))
    parts.push(audioBuffer)
    parts.push(Buffer.from('\r\n'))

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`
    ))

    if (this.config.preferredLanguage) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${this.config.preferredLanguage}\r\n`
      ))
    }

    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`
    ))

    parts.push(Buffer.from(`--${boundary}--\r\n`))

    const body = Buffer.concat(parts)

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/audio/transcriptions',
        method: 'POST',
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${this.config.groqApiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      }, (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          try {
            if (res.statusCode === 401) {
              reject(new Error('Groq API key is invalid or expired. Update it in Settings.'))
              return
            }
            if (res.statusCode === 429) {
              reject(new Error('Groq rate limit exceeded. Wait a moment and try again.'))
              return
            }
            if (res.statusCode !== 200) {
              let msg = `Groq API error (${res.statusCode})`
              try {
                const err = JSON.parse(data)
                if (err.error?.message) msg = err.error.message
              } catch { /* use generic msg */ }
              reject(new Error(msg))
              return
            }
            const json = JSON.parse(data)
            if (!json.text && json.text !== '') {
              reject(new Error('Groq returned empty response'))
              return
            }
            resolve({
              text: json.text || '',
              language: json.language || this.config.preferredLanguage || 'en',
              duration: json.duration || 0,
              provider: 'groq'
            })
          } catch (e: any) {
            reject(new Error(`Failed to parse Groq response: ${e.message}`))
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Groq API request timed out (30s). Check your internet connection.'))
      })

      req.on('error', (err) => {
        if (err.message.includes('ENOTFOUND') || err.message.includes('ENETUNREACH')) {
          reject(new Error('Cannot reach Groq API. Check your internet connection.'))
        } else {
          reject(err)
        }
      })

      req.write(body)
      req.end()
    })
  }

  private selectProvider(): 'local' | 'groq' | 'sidecar' {
    if (this.config.provider === 'sidecar') {
      if (!this.checkSidecarAvailability()) {
        throw new Error('Sidecar provider selected but vibe-audio binary not found.\nBuild with: pnpm build:sidecar')
      }
      return 'sidecar'
    }

    if (this.config.provider === 'groq') {
      if (!this.config.groqApiKey) {
        throw new Error('Cloud (Groq) provider selected but no API key is set. Add it in Settings → Voice Input.')
      }
      return 'groq'
    }

    if (this.config.provider === 'local') {
      const { available, modelDownloaded } = this.checkLocalAvailability()
      if (!available) {
        throw new Error(
          'Local provider selected but whisper-cli not found.\n' +
          'Install: brew install whisper-cpp'
        )
      }
      if (!modelDownloaded) {
        throw new Error('Local provider selected but model not downloaded. Go to Settings → Voice Input → Download.')
      }
      return 'local'
    }

    // Auto mode: try sidecar first (fastest), then Groq, then local
    if (this.checkSidecarAvailability()) {
      const modelPath = join(this.modelsDir, 'ggml-large-v3-turbo-q5_0.bin')
      if (existsSync(modelPath)) return 'sidecar'
    }

    if (this.config.groqApiKey) return 'groq'

    const { available, modelDownloaded } = this.checkLocalAvailability()
    if (available && modelDownloaded) return 'local'

    // Neither available — give actionable error
    const hints: string[] = []
    if (!this.config.groqApiKey) hints.push('Set a Groq API key in Settings → Voice Input (recommended)')
    if (!available) hints.push('Install whisper-cli: brew install whisper-cpp')
    if (available && !modelDownloaded) hints.push('Download the Whisper model in Settings → Voice Input')

    throw new Error(
      'No transcription provider available.\n' +
      hints.join('\n')
    )
  }

  /**
   * Check if the sidecar binary exists in any of the search locations.
   */
  checkSidecarAvailability(): boolean {
    const locations = [
      join(__dirname, '..', 'resources', 'bin', 'vibe-audio'),
      join(__dirname, '..', '..', 'src-sidecar', 'target', 'release', 'vibe-audio'),
      join(homedir(), '.vibeflow', 'bin', 'vibe-audio'),
    ]
    return locations.some(p => existsSync(p))
  }

  updateConfig(config: Partial<VoiceConfig>): void {
    // Validate config values
    if (config.provider !== undefined) {
      if (!['auto', 'local', 'groq', 'sidecar'].includes(config.provider)) {
        throw new Error('Invalid provider')
      }
    }
    if (config.groqApiKey !== undefined && config.groqApiKey !== null) {
      if (typeof config.groqApiKey !== 'string') throw new Error('API key must be a string')
    }

    this.config = { ...this.config, ...config }
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch { /* ignore save errors */ }
  }

  getConfig(): VoiceConfig {
    return { ...this.config }
  }
}

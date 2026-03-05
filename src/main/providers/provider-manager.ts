// Provider lifecycle manager — load/save config, test connections, detect Ollama.
// API keys encrypted at rest via Electron's safeStorage (OS keychain integration).

import { EventEmitter } from 'events'
import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ProviderId, ProviderConfig, ModelDefinition } from './types'
import { getModelsForProvider } from './model-catalog'

const CONFIG_DIR = join(homedir(), '.vibeflow')
const CONFIG_FILE = join(CONFIG_DIR, 'providers.json')

interface PersistedProvider {
  id: ProviderId
  isConnected: boolean
  encryptedApiKey?: string // base64-encoded encrypted buffer
  baseUrl?: string
}

export class ProviderManager extends EventEmitter {
  private providers = new Map<ProviderId, ProviderConfig>()

  constructor() {
    super()
    this.initDefaults()
    this.loadProviders()
  }

  private initDefaults(): void {
    const defaults: ProviderConfig[] = [
      {
        id: 'anthropic',
        name: 'Anthropic',
        authType: 'oauth',
        isConnected: false,
        models: getModelsForProvider('anthropic'),
      },
      {
        id: 'openai',
        name: 'OpenAI',
        authType: 'api-key',
        isConnected: false,
        models: getModelsForProvider('openai'),
      },
      {
        id: 'google',
        name: 'Google',
        authType: 'api-key',
        isConnected: false,
        models: getModelsForProvider('google'),
      },
      {
        id: 'ollama',
        name: 'Ollama',
        authType: 'local',
        isConnected: false,
        baseUrl: 'http://localhost:11434',
        models: [],
      },
    ]
    for (const p of defaults) {
      this.providers.set(p.id, p)
    }
  }

  /** Load saved config from disk, decrypt API keys. */
  loadProviders(): void {
    try {
      if (!existsSync(CONFIG_FILE)) return
      const raw = readFileSync(CONFIG_FILE, 'utf8')
      const saved: PersistedProvider[] = JSON.parse(raw)

      for (const entry of saved) {
        const provider = this.providers.get(entry.id)
        if (!provider) continue

        provider.isConnected = entry.isConnected
        provider.baseUrl = entry.baseUrl ?? provider.baseUrl

        if (entry.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
          try {
            const buffer = Buffer.from(entry.encryptedApiKey, 'base64')
            provider.apiKey = safeStorage.decryptString(buffer)
          } catch {
            // Decryption failed — key was from a different machine/user
            provider.apiKey = undefined
            provider.isConnected = false
          }
        }
      }
    } catch {
      // Config file corrupt or missing — use defaults
    }
  }

  /** Persist config to disk with encrypted API keys. */
  saveProviders(): void {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })

      const toSave: PersistedProvider[] = []
      for (const provider of this.providers.values()) {
        const entry: PersistedProvider = {
          id: provider.id,
          isConnected: provider.isConnected,
          baseUrl: provider.baseUrl,
        }

        if (provider.apiKey && safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(provider.apiKey)
          entry.encryptedApiKey = encrypted.toString('base64')
        }

        toSave.push(entry)
      }

      writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf8')
    } catch (err) {
      console.error('[VIBE:ProviderManager] Failed to save config:', err)
    }
  }

  /** Get all providers as an array. */
  getAllProviders(): ProviderConfig[] {
    return [...this.providers.values()]
  }

  /** Get a single provider by ID. */
  getProvider(id: ProviderId): ProviderConfig | undefined {
    return this.providers.get(id)
  }

  /** Get all models from connected providers. */
  getConnectedModels(): ModelDefinition[] {
    const models: ModelDefinition[] = []
    for (const provider of this.providers.values()) {
      if (provider.isConnected) {
        models.push(...provider.models)
      }
    }
    return models
  }

  /** Set API key for a provider, encrypt and save. */
  setApiKey(providerId: ProviderId, apiKey: string): void {
    const provider = this.providers.get(providerId)
    if (!provider) return
    provider.apiKey = apiKey
    this.saveProviders()
  }

  /** Set custom base URL (primarily for Ollama). */
  setBaseUrl(providerId: ProviderId, baseUrl: string): void {
    const provider = this.providers.get(providerId)
    if (!provider) return
    provider.baseUrl = baseUrl
    this.saveProviders()
  }

  /** Mark a provider as connected/disconnected. */
  setConnected(providerId: ProviderId, connected: boolean): void {
    const provider = this.providers.get(providerId)
    if (!provider) return
    provider.isConnected = connected
    this.saveProviders()
    this.emit(connected ? 'provider:connected' : 'provider:disconnected', { providerId })
  }

  /** Test connection for a provider. Returns true if the API key/endpoint works. */
  async testConnection(providerId: ProviderId): Promise<boolean> {
    const provider = this.providers.get(providerId)
    if (!provider) return false

    try {
      switch (providerId) {
        case 'anthropic':
          // Anthropic uses OAuth via Claude CLI — check if CLI is authenticated
          return provider.isConnected

        case 'openai': {
          if (!provider.apiKey) return false
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
            signal: AbortSignal.timeout(10_000),
          })
          return res.ok
        }

        case 'google': {
          if (!provider.apiKey) return false
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`,
            { signal: AbortSignal.timeout(10_000) }
          )
          return res.ok
        }

        case 'ollama': {
          const baseUrl = provider.baseUrl || 'http://localhost:11434'
          const res = await fetch(`${baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(5_000),
          })
          return res.ok
        }

        default:
          return false
      }
    } catch {
      return false
    }
  }

  /** Detect locally running Ollama models via /api/tags. */
  async detectOllamaModels(): Promise<ModelDefinition[]> {
    const provider = this.providers.get('ollama')
    if (!provider) return []

    const baseUrl = provider.baseUrl || 'http://localhost:11434'
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return []

      const data = (await res.json()) as { models?: Array<{ name: string; size: number; details?: { parameter_size?: string } }> }
      if (!data.models) return []

      const models: ModelDefinition[] = data.models.map((m) => ({
        id: m.name,
        provider: 'ollama' as const,
        displayName: m.name,
        costTier: 'cheap' as const,
        contextWindow: 8_000, // conservative default for local models
        supportsTools: false,
        supportsStreaming: true,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
      }))

      // Update provider's model list
      provider.models = models
      provider.isConnected = true
      this.saveProviders()
      this.emit('provider:connected', { providerId: 'ollama' })

      return models
    } catch {
      provider.isConnected = false
      provider.models = []
      return []
    }
  }

  /** Get API key for a provider (decrypted). */
  getApiKey(providerId: ProviderId): string | undefined {
    return this.providers.get(providerId)?.apiKey
  }

  /** Get base URL for a provider. */
  getBaseUrl(providerId: ProviderId): string | undefined {
    return this.providers.get(providerId)?.baseUrl
  }

  /** Check if a provider is connected. */
  isConnected(providerId: ProviderId): boolean {
    return this.providers.get(providerId)?.isConnected ?? false
  }
}

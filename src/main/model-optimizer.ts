// Model Optimizer — task classification and routing engine.
// Routes tasks to the right model by category with default + escalation tiers.
// Routing table is user-configurable and persisted.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { LlmClient, ModelDefinition } from './providers/types'
import { getModelById } from './providers/model-catalog'

const CONFIG_DIR = join(homedir(), '.vibeflow')
const CONFIG_FILE = join(CONFIG_DIR, 'model-optimizer.json')

export type TaskCategory = 'communication' | 'coding' | 'research' | 'analysis' | 'classification' | 'general'

export interface CategoryConfig {
  category: TaskCategory
  label: string
  description: string
  icon: string           // lucide icon name
  defaultModel: string   // model ID
  escalationModel: string // model ID for complex/retry
}

export const ALL_CATEGORIES: TaskCategory[] = [
  'communication', 'coding', 'research', 'analysis', 'classification', 'general'
]

export const DEFAULT_ROUTING: CategoryConfig[] = [
  {
    category: 'communication',
    label: 'Communication',
    description: 'Telegram, Discord, Slack messages, email notifications',
    icon: 'MessageSquare',
    defaultModel: 'gpt-4o-mini',
    escalationModel: 'o3-mini',
  },
  {
    category: 'coding',
    label: 'Coding',
    description: 'Write code, debug, refactor, review pull requests',
    icon: 'Code2',
    defaultModel: 'claude-sonnet-4-5',
    escalationModel: 'claude-opus-4-5',
  },
  {
    category: 'research',
    label: 'Research',
    description: 'Web research, scraping, summarising articles and pages',
    icon: 'Search',
    defaultModel: 'claude-sonnet-4-5',
    escalationModel: 'claude-opus-4-5',
  },
  {
    category: 'analysis',
    label: 'Analysis',
    description: 'Data analysis, sentiment detection, evaluation reports',
    icon: 'BarChart3',
    defaultModel: 'claude-haiku-4-5',
    escalationModel: 'claude-sonnet-4-5',
  },
  {
    category: 'classification',
    label: 'Classification',
    description: 'Tag, label, filter, triage and route content quickly',
    icon: 'Filter',
    defaultModel: 'gpt-4o-mini',
    escalationModel: 'claude-haiku-4-5',
  },
  {
    category: 'general',
    label: 'General',
    description: "Default fallback for tasks that don't match other categories",
    icon: 'CircleDot',
    defaultModel: 'claude-sonnet-4-5',
    escalationModel: 'claude-opus-4-5',
  },
]

const CLASSIFICATION_PROMPT = `Classify the following user intent into exactly one category.
Categories: communication, coding, research, analysis, classification, general.

Respond with ONLY the category name, nothing else.

User intent: `

export class ModelOptimizer {
  private routingTable: CategoryConfig[]
  private classificationClient: LlmClient | null = null
  private classificationModel = 'claude-haiku-4-5'

  constructor() {
    this.routingTable = this.loadConfig() || [...DEFAULT_ROUTING.map((c) => ({ ...c }))]
  }

  /** Set the client used for task classification (should be a cheap model). */
  setClassificationClient(client: LlmClient, model?: string): void {
    this.classificationClient = client
    if (model) this.classificationModel = model
  }

  /** Classify a user intent into a task category. */
  async classifyTask(intent: string): Promise<TaskCategory> {
    if (!this.classificationClient) {
      // No classification client available — return general
      return 'general'
    }

    try {
      const response = await this.classificationClient.chat({
        messages: [
          { role: 'user', content: CLASSIFICATION_PROMPT + intent }
        ],
        model: this.classificationModel,
        stream: false,
      }) as { content: string }

      const category = response.content.trim().toLowerCase() as TaskCategory
      if (ALL_CATEGORIES.includes(category)) {
        return category
      }
      return 'general'
    } catch {
      return 'general'
    }
  }

  /** Get the model to use for a given category. */
  getModelForCategory(category: TaskCategory, isEscalation = false): string {
    const config = this.routingTable.find((c) => c.category === category)
    if (!config) return DEFAULT_ROUTING[5].defaultModel // general fallback

    return isEscalation ? config.escalationModel : config.defaultModel
  }

  /** Get the provider for a given model ID. */
  getProviderForModel(modelId: string): string {
    const model = getModelById(modelId)
    if (model) return model.provider
    // If not in static catalog, assume Ollama (local model)
    return 'ollama'
  }

  /** Get the full routing table. */
  getRoutingTable(): CategoryConfig[] {
    return [...this.routingTable.map((c) => ({ ...c }))]
  }

  /** Update the routing table (from user configuration). */
  updateRoutingTable(table: CategoryConfig[]): void {
    this.routingTable = table.map((c) => ({ ...c }))
    this.saveConfig()
  }

  /** Update a single category's model assignments. */
  updateCategory(category: TaskCategory, defaultModel: string, escalationModel: string): void {
    const config = this.routingTable.find((c) => c.category === category)
    if (config) {
      config.defaultModel = defaultModel
      config.escalationModel = escalationModel
      this.saveConfig()
    }
  }

  /** Get model info by ID (from static catalog). */
  getModelInfo(modelId: string): ModelDefinition | undefined {
    return getModelById(modelId)
  }

  private loadConfig(): CategoryConfig[] | null {
    try {
      if (!existsSync(CONFIG_FILE)) return null
      const raw = readFileSync(CONFIG_FILE, 'utf8')
      const data = JSON.parse(raw) as CategoryConfig[]
      // Validate structure
      if (!Array.isArray(data) || data.length === 0) return null
      if (!data.every((c) => c.category && c.defaultModel && c.escalationModel)) return null
      return data
    } catch {
      return null
    }
  }

  private saveConfig(): void {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(CONFIG_FILE, JSON.stringify(this.routingTable, null, 2), 'utf8')
    } catch (err) {
      console.error('[VIBE:ModelOptimizer] Failed to save config:', err)
    }
  }
}

import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import { detectBuildIntent } from '../utils/intentDetection'
import { getTierLimits } from '../utils/tierLimits'
import type { TierLimits } from '../utils/tierLimits'
import type { FileEntry, FileContent, VoiceConfig } from '../../../preload/index.d'

// --- Shared types (must match orchestrator AgentEvent) ---

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
  | { type: 'account:info'; email: string | null; subscriptionType: string | null; organization: string | null }
  | { type: 'dangerous-command:pending'; id: string; command: string; reason: string; timestamp: number }
  | { type: 'dangerous-command:approved'; id: string; command: string }
  | { type: 'dangerous-command:rejected'; id: string; command: string; reason?: string }

// --- Dangerous Command ---

export interface PendingDangerousCommand {
  id: string
  command: string
  reason: string
  timestamp: number
}

// --- Activity Stream ---

export interface ActivityEntry {
  id: string
  timestamp: number
  taskId?: string
  type: 'tool_call' | 'text' | 'file_change' | 'error' | 'system'
  tool?: string
  content: string
}

// --- Conversation Thread ---

export interface ConversationEntry {
  id: string
  intent: string
  timestamp: number
  status: 'thinking' | 'running' | 'completed' | 'failed'
  taskCount: number
  snapshotHash?: string
}

// --- File Changes ---

export interface FileChange {
  path: string
  type: 'created' | 'modified' | 'deleted'
  taskId?: string
}

// --- Dev Server ---

export interface DevServerState {
  running: boolean
  url: string | null
  output: string[]
  command: string | null
}

// --- Snapshots ---

export interface Snapshot {
  id: string
  intent: string
  timestamp: number
  commitHash: string
}

// --- Permissions & Settings ---

export interface Permissions {
  files: boolean
  terminal: boolean
  search: boolean
  skipPermissions: boolean
}

export interface Settings {
  concurrency: number
  maxTurns: number
  model: string // model ID or 'default'
  cwd: string
}

export interface GitHubStatus {
  authenticated: boolean
  username: string | null
  remote: string | null
}

export interface ClaudeConnectivity {
  connected: boolean
  version: string | null
  lastCheck: number
}

// --- App Mode ---

export type AppMode = 'terminal' | 'chat'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: Array<{ name: string; input: string }>
  timestamp: number
  isStreaming?: boolean
  costUsd?: number
  turns?: number
}

// --- Mode Switch Prompt ---

export interface ModeSwitchPrompt {
  visible: boolean
  direction: 'to-terminal' | 'to-chat'
  lastDismissed: number
}

// --- Store ---

let activityCounter = 0

interface AgentState {
  tasks: Record<string, AgentTask>
  architectStatus: 'idle' | 'thinking' | 'done'
  isAuthenticated: boolean | null
  authInstalled: boolean | null
  permissions: Permissions
  settings: Settings
  claudeMd: string

  // App mode
  mode: AppMode
  chatMessages: ChatMessage[]
  chatSessionId: string | null
  chatStreaming: boolean
  modeSwitchPrompt: ModeSwitchPrompt

  // Task approval gate
  intentPendingApproval: boolean

  // Plan viewport
  planExpanded: boolean

  // Display & connectivity
  uiScale: number
  github: GitHubStatus
  claudeConnectivity: ClaudeConnectivity

  // New state
  activityLog: ActivityEntry[]
  conversationHistory: ConversationEntry[]
  currentConversationId: string | null
  fileChanges: FileChange[]
  devServer: DevServerState
  snapshots: Snapshot[]

  // Session usage (tokens + cost)
  sessionUsage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
    contextWindow: number
    costUsd: number
    model: string
  }

  // Intelligence layer
  projectProfile: {
    name: string
    language: string
    framework: string | null
    packageManager: string | null
    devCommand: string | null
    buildCommand: string | null
    testCommand: string | null
    branch: string | null
  } | null

  // Subscription tier
  accountInfo: { email: string | null; subscriptionType: string | null; organization: string | null } | null
  tierLimits: TierLimits | null

  // Security state
  permissionTier: 'normal' | 'bypass'
  pendingDangerousCommands: PendingDangerousCommand[]

  // Active project (null = no project selected)
  activeProject: { name: string; path: string; branch: string } | null

  // Project diagnosis (aggregated health data)
  projectDiagnosis: {
    git: { hasGit: boolean; branch: string | null; uncommittedCount: number; unpushedCount: number; lastCommitMessage: string | null }
    stack: { language: string; framework: string | null; packageManager: string | null; devCommand: string | null; buildCommand: string | null; testCommand: string | null }
    pulse: { entryFiles: string[]; diagnosticCount: number; hasClaudeMd: boolean; hasPackageJson: boolean; isInitialized: boolean }
    suggestions: string[]
  } | null

  // Live browser preview
  previewUrl: string | null
  previewVisible: boolean

  // Git modal state
  gitStatus: { uncommittedCount: number; unpushedCount: number; currentBranch: string | null }
  gitModal: 'commit' | 'push' | null

  // File explorer state
  fileTree: Record<string, FileEntry[]>
  expandedDirs: string[]
  selectedFile: FileContent | null
  fileViewerOpen: boolean
  fileViewerDirty: boolean

  // Voice state
  voiceConfig: (VoiceConfig & { localAvailable: boolean; modelDownloaded: boolean; sidecarAvailable?: boolean }) | null
  voiceRecording: boolean
  voiceProcessing: boolean
  voiceListening: boolean
  voiceAutoMode: boolean
  voiceLastTranslation: { from: string; to: string; original: string } | null
  whisperModelProgress: number | null

  // Existing actions
  handleEvent: (event: AgentEvent) => void
  submitIntent: (text: string) => void
  setPermission: (key: keyof Permissions, value: boolean) => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setClaudeMd: (content: string) => void
  getNodes: () => Node[]
  getEdges: () => Edge[]

  // Mode actions
  toggleMode: () => void
  submitChat: (text: string) => void
  clearChat: () => void
  deleteMessage: (id: string) => void
  editAndReprompt: (id: string, newContent: string) => void
  clearActivityLog: () => void
  showModeSwitchPrompt: (direction: ModeSwitchPrompt['direction']) => void
  dismissModeSwitchPrompt: () => void
  acceptModeSwitchPrompt: () => void

  // Display & connectivity actions
  setUIScale: (scale: number) => void
  setGitHub: (status: Partial<GitHubStatus>) => void
  setClaudeConnectivity: (status: Partial<ClaudeConnectivity>) => void

  // Approval gate actions
  approveIntent: () => void
  rejectIntent: () => void

  // Stop/cancel action
  cancelAll: () => void

  // Plan viewport actions
  togglePlanViewport: () => void

  // New actions
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  retryTask: (taskId: string) => void
  undoLastIntent: () => void
  runQuickAction: (action: 'commit' | 'test' | 'run' | 'undo' | 'push') => void
  setDevServer: (state: Partial<DevServerState>) => void
  addDevServerOutput: (line: string) => void
  refreshFileChanges: () => void

  // Intelligence actions
  fetchProjectProfile: () => void

  // Security actions
  setPermissionTier: (tier: 'normal' | 'bypass') => void
  approveDangerousCommand: (id: string) => void
  rejectDangerousCommand: (id: string) => void

  // Project actions
  switchProject: (project: { name: string; path: string; branch: string }) => void
  setActiveProject: (project: { name: string; path: string; branch: string } | null) => void
  diagnoseActiveProject: () => void

  // Preview actions
  openPreview: (url: string) => void
  closePreview: () => void

  // Git modal actions
  refreshGitStatus: () => void
  openGitModal: (type: 'commit' | 'push') => void
  closeGitModal: () => void

  // Voice actions
  fetchVoiceConfig: () => Promise<void>
  updateVoiceConfig: (config: Partial<VoiceConfig>) => Promise<void>
  setVoiceRecording: (recording: boolean) => void
  setVoiceProcessing: (processing: boolean) => void
  setVoiceListening: (listening: boolean) => void
  setVoiceAutoMode: (autoMode: boolean) => void
  setVoiceLastTranslation: (t: { from: string; to: string; original: string } | null) => void
  downloadWhisperModel: () => Promise<void>

  // File explorer actions
  loadDirectory: (relativePath: string) => Promise<void>
  toggleDirectory: (relativePath: string) => void
  openFile: (relativePath: string) => Promise<void>
  saveFile: (relativePath: string, content: string) => Promise<void>
  deleteFileEntry: (relativePath: string) => Promise<void>
  renameFileEntry: (oldPath: string, newName: string) => Promise<void>
  createFileEntry: (relativePath: string) => Promise<void>
  createDirectoryEntry: (relativePath: string) => Promise<void>
  closeFileViewer: () => void
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  tasks: {},
  architectStatus: 'idle',
  isAuthenticated: null,
  authInstalled: null,
  permissions: { files: true, terminal: true, search: true, skipPermissions: false },
  settings: { concurrency: 3, maxTurns: 10, model: 'default', cwd: '' },
  claudeMd: '',

  // App mode defaults
  mode: 'terminal',
  chatMessages: [],
  chatSessionId: null,
  chatStreaming: false,
  modeSwitchPrompt: { visible: false, direction: 'to-terminal', lastDismissed: 0 },

  // Task approval gate
  intentPendingApproval: false,

  // Plan viewport
  planExpanded: false,

  // Display & connectivity defaults
  uiScale: (() => {
    try {
      const stored = localStorage.getItem('vibeflow:ui-scale')
      return stored ? Number(stored) : 1
    } catch { return 1 }
  })(),
  github: { authenticated: false, username: null, remote: null },
  claudeConnectivity: { connected: false, version: null, lastCheck: 0 },

  // New state defaults
  activityLog: [],
  conversationHistory: [],
  currentConversationId: null,
  fileChanges: [],
  devServer: { running: false, url: null, output: [], command: null },
  snapshots: [],

  // Session usage defaults
  sessionUsage: {
    inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheCreationTokens: 0,
    contextWindow: 0, costUsd: 0, model: '',
  },

  // Intelligence defaults
  projectProfile: null,

  // Subscription tier defaults
  accountInfo: null,
  tierLimits: null,

  // Security defaults
  permissionTier: 'bypass',
  pendingDangerousCommands: [],

  // Active project default
  activeProject: null,

  // Project diagnosis default
  projectDiagnosis: null,

  // Preview defaults
  previewUrl: null,
  previewVisible: false,

  // Git modal defaults
  gitStatus: { uncommittedCount: 0, unpushedCount: 0, currentBranch: null },
  gitModal: null,

  // File explorer defaults
  fileTree: {},
  expandedDirs: [],
  selectedFile: null,
  fileViewerOpen: false,
  fileViewerDirty: false,

  // Voice defaults
  voiceConfig: null,
  voiceRecording: false,
  voiceProcessing: false,
  voiceListening: false,
  voiceAutoMode: false,
  voiceLastTranslation: null,
  whisperModelProgress: null,

  handleEvent: (event) => {
    console.log('[VIBE:Store] handleEvent:', event.type, event)
    const { addActivity } = get()

    switch (event.type) {
      case 'auth:status':
        set({
          authInstalled: event.installed,
          isAuthenticated: event.installed && event.authenticated
        })
        break

      case 'architect:thinking':
        set({ architectStatus: 'thinking' })
        addActivity({ type: 'system', content: 'Architect is analyzing intent...' })
        break

      case 'architect:done':
        set((state) => {
          const convId = state.currentConversationId
          const hasTasks = event.tasks.length > 0
          return {
            architectStatus: 'done',
            tasks: Object.fromEntries(event.tasks.map((t) => [t.id, t])),
            intentPendingApproval: hasTasks,
            planExpanded: hasTasks ? true : state.planExpanded,
            conversationHistory: state.conversationHistory.map((c) =>
              c.id === convId ? { ...c, status: 'running' as const, taskCount: event.tasks.length } : c
            )
          }
        })
        addActivity({
          type: 'system',
          content: `Architect created ${event.tasks.length} tasks`
        })
        break

      case 'task:created':
        set((state) => ({
          tasks: { ...state.tasks, [event.task.id]: event.task }
        }))
        addActivity({
          type: 'system',
          taskId: event.task.id,
          content: `Task queued: ${event.task.description}`
        })
        break

      case 'task:started':
        set((state) => ({
          tasks: {
            ...state.tasks,
            [event.task.id]: { ...event.task, status: 'running' }
          }
        }))
        addActivity({
          type: 'system',
          taskId: event.task.id,
          content: `Worker started: ${event.task.description}`
        })
        break

      case 'task:progress':
        set((state) => {
          const existing = state.tasks[event.taskId]
          if (!existing) return state
          return {
            tasks: {
              ...state.tasks,
              [event.taskId]: {
                ...existing,
                toolInUse: event.toolInUse ?? existing.toolInUse
              }
            }
          }
        })
        if (event.toolInUse) {
          addActivity({
            type: 'tool_call',
            taskId: event.taskId,
            tool: event.toolInUse,
            content: event.content || `Using ${event.toolInUse}`
          })
          // Detect file changes from tool calls
          if (['Write', 'Edit'].includes(event.toolInUse) && event.content) {
            const pathMatch = event.content.match(/(?:Writing|Editing|Created|Modified)\s+(.+?)(?:\s|$)/)
            if (pathMatch) {
              set((state) => ({
                fileChanges: [
                  ...state.fileChanges.filter((f) => f.path !== pathMatch[1]),
                  {
                    path: pathMatch[1],
                    type: event.toolInUse === 'Write' ? 'created' : 'modified',
                    taskId: event.taskId
                  }
                ]
              }))
            }
          }
        } else if (event.content) {
          addActivity({ type: 'text', taskId: event.taskId, content: event.content })
        }
        // Parse for localhost URLs in output
        if (event.content) {
          const localhostMatch = event.content.match(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\S*/)
          if (localhostMatch && !get().previewUrl) {
            set({ previewUrl: localhostMatch[0] })
          }
        }
        break

      case 'task:completed': {
        set((state) => ({
          tasks: {
            ...state.tasks,
            [event.task.id]: { ...event.task, status: 'completed', toolInUse: undefined }
          }
        }))
        addActivity({
          type: 'system',
          taskId: event.task.id,
          content: `Completed: ${event.task.description}`
        })
        // Check if all tasks done → update conversation status
        const allTasks = Object.values(get().tasks)
        const allDone = allTasks.every((t) => t.status === 'completed' || t.status === 'failed')
        if (allDone) {
          const anyFailed = allTasks.some((t) => t.status === 'failed')
          set((state) => ({
            conversationHistory: state.conversationHistory.map((c) =>
              c.id === state.currentConversationId
                ? { ...c, status: anyFailed ? 'failed' : 'completed' }
                : c
            )
          }))
          // Refresh file changes from git
          get().refreshFileChanges()
        }
        break
      }

      case 'task:failed':
        set((state) => ({
          tasks: {
            ...state.tasks,
            [event.task.id]: { ...event.task, status: 'failed', toolInUse: undefined }
          }
        }))
        addActivity({
          type: 'error',
          taskId: event.task.id,
          content: `Failed: ${event.task.description} — ${event.error}`
        })
        // Check if all tasks done
        const tasks = Object.values(get().tasks)
        const done = tasks.every((t) => t.status === 'completed' || t.status === 'failed')
        if (done) {
          set((state) => ({
            conversationHistory: state.conversationHistory.map((c) =>
              c.id === state.currentConversationId ? { ...c, status: 'failed' } : c
            )
          }))
        }
        break

      // --- Chat events ---

      case 'chat:session':
        set({
          chatSessionId: event.sessionId,
          sessionUsage: {
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheCreationTokens: 0,
            contextWindow: 0, costUsd: 0, model: '',
          },
        })
        break

      case 'chat:text':
        set((state) => {
          const msgs = [...state.chatMessages]
          const last = msgs[msgs.length - 1]
          // Append to current streaming assistant message or create new one
          if (last && last.role === 'assistant' && last.isStreaming) {
            msgs[msgs.length - 1] = { ...last, content: last.content + event.content }
          } else {
            msgs.push({
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'assistant',
              content: event.content,
              toolCalls: [],
              timestamp: Date.now(),
              isStreaming: true
            })
          }
          return { chatMessages: msgs, chatStreaming: true }
        })
        break

      case 'chat:tool-use':
        set((state) => {
          const msgs = [...state.chatMessages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant' && last.isStreaming) {
            msgs[msgs.length - 1] = {
              ...last,
              toolCalls: [...last.toolCalls, { name: event.name, input: event.input }]
            }
          }
          // Dedup activity: collapse consecutive tool calls within 2s into one row
          const log = [...state.activityLog]
          const lastEntry = log[log.length - 1]
          const now = Date.now()
          if (lastEntry && lastEntry.type === 'tool_call' && (now - lastEntry.timestamp) < 2000) {
            // Append tool name to existing entry
            log[log.length - 1] = {
              ...lastEntry,
              content: `${lastEntry.content} → ${event.name}`,
            }
          } else {
            log.push({
              id: `act-${++activityCounter}`,
              timestamp: now,
              type: 'tool_call',
              tool: event.name,
              content: event.name,
            })
            // Cap at 500
            if (log.length > 500) log.splice(0, log.length - 500)
          }
          return { chatMessages: msgs, activityLog: log }
        })
        break

      case 'chat:cost':
        // Store cost info on the last assistant message
        set((state) => {
          const msgs = [...state.chatMessages]
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant') {
              msgs[i] = { ...msgs[i], costUsd: event.costUsd, turns: event.turns }
              break
            }
          }
          // Accumulate session usage
          const prev = state.sessionUsage
          return {
            chatMessages: msgs,
            sessionUsage: {
              inputTokens: prev.inputTokens + event.inputTokens,
              outputTokens: prev.outputTokens + event.outputTokens,
              cacheReadTokens: prev.cacheReadTokens + event.cacheReadTokens,
              cacheCreationTokens: prev.cacheCreationTokens + event.cacheCreationTokens,
              contextWindow: event.contextWindow || prev.contextWindow,
              costUsd: event.costUsd, // total_cost_usd is already cumulative from SDK
              model: event.model || prev.model,
            },
          }
        })
        break

      case 'chat:done': {
        set((state) => {
          const msgs = state.chatMessages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m
          )
          return { chatMessages: msgs, chatStreaming: false }
        })
        // Check last assistant message for build intent → suggest mode switch
        const { chatMessages, mode: currentMode, showModeSwitchPrompt } = get()
        if (currentMode === 'chat') {
          const lastAssistant = [...chatMessages].reverse().find((m) => m.role === 'assistant')
          if (lastAssistant && detectBuildIntent(lastAssistant.content)) {
            showModeSwitchPrompt('to-terminal')
          }
        }
        break
      }

      case 'chat:error':
        set((state) => {
          const msgs = state.chatMessages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m
          )
          // Add error as assistant message
          msgs.push({
            id: `msg-err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${event.error}`,
            toolCalls: [],
            timestamp: Date.now()
          })
          return { chatMessages: msgs, chatStreaming: false }
        })
        break

      // --- Account info (tier detection) ---

      case 'account:info': {
        const limits = getTierLimits(event.subscriptionType)
        set({
          accountInfo: {
            email: event.email,
            subscriptionType: event.subscriptionType,
            organization: event.organization,
          },
          tierLimits: limits,
        })
        break
      }

      // --- Dangerous command events ---

      case 'dangerous-command:pending':
        set((state) => ({
          pendingDangerousCommands: [
            ...state.pendingDangerousCommands,
            { id: event.id, command: event.command, reason: event.reason, timestamp: event.timestamp }
          ]
        }))
        addActivity({ type: 'error', content: `Dangerous command blocked: ${event.reason}` })
        break

      case 'dangerous-command:approved':
        set((state) => ({
          pendingDangerousCommands: state.pendingDangerousCommands.filter((c) => c.id !== event.id)
        }))
        addActivity({ type: 'system', content: `Command approved: ${event.command}` })
        break

      case 'dangerous-command:rejected':
        set((state) => ({
          pendingDangerousCommands: state.pendingDangerousCommands.filter((c) => c.id !== event.id)
        }))
        addActivity({ type: 'system', content: `Command rejected: ${event.command}` })
        break
    }
  },

  submitIntent: (text) => {
    console.log('[VIBE:Store] submitIntent called:', text)
    const { permissions, settings } = get()
    console.log('[VIBE:Store] permissions:', permissions, 'settings:', settings)
    const convId = `conv-${Date.now()}`

    // Create snapshot before executing
    window.api.createSnapshot(text).then((snapshot) => {
      console.log('[VIBE:Store] snapshot result:', snapshot)
      if (snapshot) {
        set((state) => ({ snapshots: [...state.snapshots, snapshot] }))
      }
    }).catch((err: unknown) => console.error('[VIBE:Store] snapshot error:', err))

    set((state) => ({
      architectStatus: 'thinking',
      tasks: {},
      fileChanges: [],
      currentConversationId: convId,
      conversationHistory: [
        ...state.conversationHistory,
        {
          id: convId,
          intent: text,
          timestamp: Date.now(),
          status: 'thinking',
          taskCount: 0
        }
      ]
    }))

    get().addActivity({ type: 'system', content: `Intent: "${text}"` })
    console.log('[VIBE:Store] calling window.api.submitIntent...')
    window.api.submitIntent(text, { permissions, settings })
      .then(() => console.log('[VIBE:Store] submitIntent IPC resolved OK'))
      .catch((err: unknown) => {
        console.error('[VIBE:Store] submitIntent IPC REJECTED:', err)
        const errMsg = err instanceof Error ? err.message : String(err)
        set({ architectStatus: 'idle' })
        get().addActivity({ type: 'error', content: `Architect failed: ${errMsg}` })
      })
  },

  setPermission: (key, value) => {
    set((state) => ({ permissions: { ...state.permissions, [key]: value } }))
  },

  setSetting: (key, value) => {
    set((state) => ({ settings: { ...state.settings, [key]: value } }))
    window.api.updateSettings({ ...get().settings, [key]: value })
  },

  setClaudeMd: (content) => {
    set({ claudeMd: content })
  },

  // --- Mode actions ---

  toggleMode: () => {
    set((state) => ({ mode: state.mode === 'terminal' ? 'chat' : 'terminal' }))
  },

  showModeSwitchPrompt: (direction) => {
    const { mode, modeSwitchPrompt } = get()
    // Don't show if already in the target mode or within 30s cooldown
    if (
      (direction === 'to-terminal' && mode === 'terminal') ||
      (direction === 'to-chat' && mode === 'chat') ||
      Date.now() - modeSwitchPrompt.lastDismissed < 30_000
    ) return
    set({ modeSwitchPrompt: { ...modeSwitchPrompt, visible: true, direction } })
  },

  dismissModeSwitchPrompt: () => {
    set((state) => ({
      modeSwitchPrompt: { ...state.modeSwitchPrompt, visible: false, lastDismissed: Date.now() }
    }))
  },

  acceptModeSwitchPrompt: () => {
    const { modeSwitchPrompt } = get()
    const newMode = modeSwitchPrompt.direction === 'to-terminal' ? 'terminal' : 'chat'
    set({
      mode: newMode,
      modeSwitchPrompt: { ...modeSwitchPrompt, visible: false }
    })
  },

  // Approval gate actions
  approveIntent: () => {
    set({ intentPendingApproval: false })
    window.api.approveIntent().catch((err: unknown) => {
      console.error('[VIBE:Store] approveIntent error:', err)
    })
  },

  rejectIntent: () => {
    set({ intentPendingApproval: false, tasks: {}, architectStatus: 'idle' })
    window.api.rejectIntent().catch((err: unknown) => {
      console.error('[VIBE:Store] rejectIntent error:', err)
    })
    get().addActivity({ type: 'system', content: 'Intent rejected by user' })
  },

  // Stop/cancel all
  cancelAll: () => {
    const { mode, chatStreaming, tasks } = get()
    if (mode === 'chat' && chatStreaming) {
      window.api.cancelChat().catch(() => {})
      set({ chatStreaming: false })
    }
    if (mode === 'terminal') {
      for (const task of Object.values(tasks)) {
        if (task.status === 'running') {
          window.api.cancelTask(task.id).catch(() => {})
        }
      }
    }
    get().addActivity({ type: 'system', content: 'Cancelled by user' })
  },

  // Plan viewport
  togglePlanViewport: () => {
    set((state) => ({ planExpanded: !state.planExpanded }))
  },

  submitChat: (text) => {
    const { permissions, settings } = get()
    // Add user message
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user' as const,
          content: text,
          toolCalls: [],
          timestamp: Date.now()
        }
      ],
      chatStreaming: true
    }))

    // Build allowed tools from permissions
    const allowedTools: string[] = []
    if (permissions.files) allowedTools.push('Read', 'Write', 'Edit')
    if (permissions.terminal) allowedTools.push('Bash')
    if (permissions.search) allowedTools.push('Glob', 'Grep')

    window.api.submitChat(text, {
      allowedTools: permissions.skipPermissions ? undefined : (allowedTools.length > 0 ? allowedTools : undefined),
      maxTurns: settings.maxTurns,
    }).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err)
      set((state) => ({
        chatStreaming: false,
        chatMessages: [
          ...state.chatMessages,
          {
            id: `msg-err-${Date.now()}`,
            role: 'assistant' as const,
            content: `Error: ${errMsg}`,
            toolCalls: [],
            timestamp: Date.now()
          }
        ]
      }))
    })
  },

  clearChat: () => {
    window.api.clearChat().catch(() => { /* ignore */ })
    set({ chatMessages: [], chatSessionId: null, chatStreaming: false })
  },

  deleteMessage: (id) => {
    set((state) => ({
      chatMessages: state.chatMessages.filter((m) => m.id !== id)
    }))
  },

  editAndReprompt: (id, newContent) => {
    const { chatMessages } = get()
    const idx = chatMessages.findIndex((m) => m.id === id)
    if (idx === -1) return

    // Truncate everything from this message onward, replace with edited content
    const truncated = chatMessages.slice(0, idx)

    // Clear the existing session so the AI sees the corrected history
    window.api.clearChat().catch(() => {})

    set({
      chatMessages: [
        ...truncated,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user' as const,
          content: newContent,
          toolCalls: [],
          timestamp: Date.now(),
        }
      ],
      chatSessionId: null,
      chatStreaming: true,
    })

    // Re-submit
    const { permissions, settings } = get()
    const allowedTools: string[] = []
    if (permissions.files) allowedTools.push('Read', 'Write', 'Edit')
    if (permissions.terminal) allowedTools.push('Bash')
    if (permissions.search) allowedTools.push('Glob', 'Grep')

    window.api.submitChat(newContent, {
      allowedTools: permissions.skipPermissions ? undefined : (allowedTools.length > 0 ? allowedTools : undefined),
      maxTurns: settings.maxTurns,
    }).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err)
      set((state) => ({
        chatStreaming: false,
        chatMessages: [
          ...state.chatMessages,
          {
            id: `msg-err-${Date.now()}`,
            role: 'assistant' as const,
            content: `Error: ${errMsg}`,
            toolCalls: [],
            timestamp: Date.now(),
          }
        ]
      }))
    })
  },

  clearActivityLog: () => {
    set({ activityLog: [] })
  },

  // --- Display & connectivity actions ---

  setUIScale: (scale) => {
    set({ uiScale: scale })
    try { localStorage.setItem('vibeflow:ui-scale', String(scale)) } catch { /* noop */ }
    document.documentElement.style.setProperty('--ui-scale', String(scale))
  },

  setGitHub: (status) => {
    set((state) => ({ github: { ...state.github, ...status } }))
  },

  setClaudeConnectivity: (status) => {
    set((state) => ({ claudeConnectivity: { ...state.claudeConnectivity, ...status, lastCheck: Date.now() } }))
  },

  // --- New actions ---

  addActivity: (entry) => {
    const full: ActivityEntry = {
      ...entry,
      id: `act-${++activityCounter}`,
      timestamp: Date.now()
    }
    set((state) => ({
      activityLog: [...state.activityLog.slice(-500), full] // cap at 500
    }))
  },

  retryTask: (taskId) => {
    const task = get().tasks[taskId]
    if (!task || task.status !== 'failed') return
    get().addActivity({ type: 'system', taskId, content: `Retrying: ${task.description}` })
    window.api.retryTask(taskId)
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: { ...task, status: 'pending', toolInUse: undefined, completedAt: undefined }
      }
    }))
  },

  undoLastIntent: () => {
    const { snapshots, addActivity } = get()
    if (snapshots.length === 0) return
    const last = snapshots[snapshots.length - 1]
    addActivity({ type: 'system', content: `Undoing: reverting to before "${last.intent}"` })
    window.api.restoreSnapshot(last.commitHash).then(() => {
      set((state) => ({
        snapshots: state.snapshots.slice(0, -1),
        tasks: {},
        architectStatus: 'idle',
        fileChanges: [],
        conversationHistory: state.conversationHistory.slice(0, -1)
      }))
      addActivity({ type: 'system', content: 'Undo complete — workspace restored' })
    }).catch((err: unknown) => {
      addActivity({ type: 'error', content: `Undo failed: ${err instanceof Error ? err.message : String(err)}` })
    })
  },

  runQuickAction: (action) => {
    const { addActivity } = get()
    if (action === 'undo') {
      get().undoLastIntent()
      return
    }
    addActivity({ type: 'system', content: `Running: ${action}` })
    window.api.runQuickAction(action).then((result) => {
      addActivity({
        type: result.success ? 'system' : 'error',
        content: result.output || `${action} ${result.success ? 'succeeded' : 'failed'}`
      })
    }).catch((err: unknown) => {
      addActivity({ type: 'error', content: `${action} failed: ${err instanceof Error ? err.message : String(err)}` })
    })
  },

  setDevServer: (partial) => {
    set((state) => ({ devServer: { ...state.devServer, ...partial } }))
  },

  addDevServerOutput: (line) => {
    set((state) => ({
      devServer: {
        ...state.devServer,
        output: [...state.devServer.output.slice(-200), line] // cap at 200 lines
      }
    }))
    // Parse for localhost URLs in dev server output
    const localhostMatch = line.match(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\S*/)
    if (localhostMatch && !get().previewUrl) {
      set({ previewUrl: localhostMatch[0] })
    }
  },

  refreshFileChanges: () => {
    window.api.getFileChanges().then((changes) => {
      if (changes && changes.length > 0) {
        set({ fileChanges: changes })
      }
    }).catch(() => { /* ignore */ })
  },

  // --- Intelligence actions ---

  fetchProjectProfile: () => {
    window.api.getProjectProfile().then((profile) => {
      if (profile) {
        set({
          projectProfile: {
            name: profile.name,
            language: profile.language,
            framework: profile.framework,
            packageManager: profile.packageManager,
            devCommand: profile.devCommand,
            buildCommand: profile.buildCommand,
            testCommand: profile.testCommand,
            branch: profile.branch,
          }
        })
      }
    }).catch(() => { /* ignore */ })
  },

  // --- Security actions ---

  setPermissionTier: (tier) => {
    set({ permissionTier: tier })
    window.api.setPermissionTier(tier).catch((err: unknown) => {
      console.error('[VIBE:Store] setPermissionTier error:', err)
    })
  },

  approveDangerousCommand: (id) => {
    window.api.approveDangerousCommand(id).catch((err: unknown) => {
      console.error('[VIBE:Store] approveDangerousCommand error:', err)
    })
  },

  rejectDangerousCommand: (id) => {
    window.api.rejectDangerousCommand(id).catch((err: unknown) => {
      console.error('[VIBE:Store] rejectDangerousCommand error:', err)
    })
  },

  // --- Project actions ---

  switchProject: (project) => {
    window.api.switchProject(project.path).then((result) => {
      if (result.success) {
        // Full state reset for project isolation
        set({
          activeProject: project,
          tasks: {},
          chatMessages: [],
          chatSessionId: null,
          chatStreaming: false,
          activityLog: [],
          fileChanges: [],
          snapshots: [],
          sessionUsage: {
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheCreationTokens: 0,
            contextWindow: 0, costUsd: 0, model: '',
          },
          projectProfile: null,
          projectDiagnosis: null,
          gitStatus: { uncommittedCount: 0, unpushedCount: 0, currentBranch: null },
          devServer: { running: false, url: null, output: [], command: null },
          previewUrl: null,
          previewVisible: false,
          pendingDangerousCommands: [],
          architectStatus: 'idle',
          intentPendingApproval: false,
          gitModal: null,
          conversationHistory: [],
          currentConversationId: null,
          fileTree: {},
          expandedDirs: [],
          selectedFile: null,
          fileViewerOpen: false,
          fileViewerDirty: false,
        })
        // Refresh git status for the new project
        get().refreshGitStatus()
        get().fetchProjectProfile()
        get().diagnoseActiveProject()
      }
    }).catch((err: unknown) => {
      console.error('[VIBE:Store] switchProject error:', err)
    })
  },

  setActiveProject: (project) => {
    set({ activeProject: project })
  },

  diagnoseActiveProject: () => {
    window.api.diagnoseProject().then((diagnosis) => {
      set({ projectDiagnosis: diagnosis })
      const { addActivity } = get()
      const { git, stack, pulse, suggestions } = diagnosis
      const gitLine = `Git: ${git.branch || 'no branch'}${git.uncommittedCount ? ` | ${git.uncommittedCount} uncommitted` : ''}${git.unpushedCount ? ` | ${git.unpushedCount} unpushed` : ''}${git.lastCommitMessage ? ` | "${git.lastCommitMessage}"` : ''}`
      const stackLine = `Stack: ${stack.language}${stack.framework ? ` / ${stack.framework}` : ''}${stack.packageManager ? ` (${stack.packageManager})` : ''}`
      const pulseLine = `Pulse: ${pulse.entryFiles.length} entry files${pulse.diagnosticCount ? ` | ${pulse.diagnosticCount} diagnostics` : ''}`
      const suggestLine = suggestions.length > 0 ? `Suggestions: ${suggestions.join(' | ')}` : ''
      addActivity({ type: 'system', content: [gitLine, stackLine, pulseLine, suggestLine].filter(Boolean).join('\n') })
    }).catch(() => { /* ignore */ })
  },

  // --- Preview actions ---

  openPreview: (url) => {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) return
    set({ previewUrl: url, previewVisible: true })
  },

  closePreview: () => {
    set({ previewUrl: null, previewVisible: false })
  },

  // --- Git modal actions ---

  refreshGitStatus: () => {
    // No-op if no project is active
    if (!get().activeProject) return
    Promise.all([
      window.api.getGitStatus(),
      window.api.getCurrentBranch(),
    ]).then(([status, branch]) => {
      set({
        gitStatus: {
          uncommittedCount: status.uncommittedCount,
          unpushedCount: status.unpushedCount,
          currentBranch: branch,
        }
      })
    }).catch(() => { /* ignore */ })
  },

  openGitModal: (type) => {
    set({ gitModal: type })
  },

  closeGitModal: () => {
    set({ gitModal: null })
  },

  // --- File explorer actions ---

  loadDirectory: async (relativePath: string) => {
    try {
      const entries = await window.api.listDirectory(relativePath)
      set(s => ({ fileTree: { ...s.fileTree, [relativePath]: entries } }))
    } catch (e) {
      console.error('Failed to load directory:', e)
    }
  },

  toggleDirectory: (relativePath: string) => {
    set(s => {
      const expanded = s.expandedDirs.includes(relativePath)
      return {
        expandedDirs: expanded
          ? s.expandedDirs.filter(d => d !== relativePath)
          : [...s.expandedDirs, relativePath]
      }
    })
    const state = get()
    if (state.expandedDirs.includes(relativePath)) {
      // Was just expanded, load children
      state.loadDirectory(relativePath)
    }
  },

  openFile: async (relativePath: string) => {
    try {
      const content = await window.api.readFile(relativePath)
      set({ selectedFile: content, fileViewerOpen: true, fileViewerDirty: false })
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  },

  saveFile: async (relativePath: string, content: string) => {
    try {
      await window.api.writeFile(relativePath, content)
      set({ fileViewerDirty: false })
      const parentDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
      get().loadDirectory(parentDir || '.')
    } catch (e) {
      console.error('Failed to save file:', e)
    }
  },

  deleteFileEntry: async (relativePath: string) => {
    try {
      await window.api.deleteFile(relativePath)
      const parentDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
      get().loadDirectory(parentDir || '.')
    } catch (e) {
      console.error('Failed to delete file:', e)
    }
  },

  renameFileEntry: async (oldPath: string, newName: string) => {
    try {
      await window.api.renameFile(oldPath, newName)
      const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : ''
      get().loadDirectory(parentDir || '.')
    } catch (e) {
      console.error('Failed to rename file:', e)
    }
  },

  createFileEntry: async (relativePath: string) => {
    try {
      await window.api.createFile(relativePath)
      const parentDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
      get().loadDirectory(parentDir || '.')
    } catch (e) {
      console.error('Failed to create file:', e)
    }
  },

  createDirectoryEntry: async (relativePath: string) => {
    try {
      await window.api.createDirectory(relativePath)
      const parentDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
      get().loadDirectory(parentDir || '.')
    } catch (e) {
      console.error('Failed to create directory:', e)
    }
  },

  closeFileViewer: () => {
    set({ selectedFile: null, fileViewerOpen: false, fileViewerDirty: false })
  },

  // --- Voice actions ---

  fetchVoiceConfig: async () => {
    try {
      const config = await window.api.getVoiceConfig()
      set({ voiceConfig: config })
    } catch (e) {
      console.error('Failed to fetch voice config:', e)
    }
  },

  updateVoiceConfig: async (config) => {
    try {
      await window.api.updateVoiceConfig(config)
      const updated = await window.api.getVoiceConfig()
      set({ voiceConfig: updated })
    } catch (e) {
      console.error('Failed to update voice config:', e)
    }
  },

  setVoiceRecording: (recording) => set({ voiceRecording: recording }),
  setVoiceProcessing: (processing) => set({ voiceProcessing: processing }),
  setVoiceListening: (listening) => set({ voiceListening: listening }),
  setVoiceAutoMode: (autoMode) => set({ voiceAutoMode: autoMode }),
  setVoiceLastTranslation: (t) => set({ voiceLastTranslation: t }),

  downloadWhisperModel: async () => {
    try {
      set({ whisperModelProgress: 0 })
      const cleanup = window.api.onVoiceDownloadProgress((pct: number) => {
        set({ whisperModelProgress: pct })
      })
      await window.api.downloadWhisperModel()
      cleanup()
      set({ whisperModelProgress: null })
      const config = await window.api.getVoiceConfig()
      set({ voiceConfig: config })
    } catch (e) {
      set({ whisperModelProgress: null })
      console.error('Failed to download model:', e)
    }
  },

  // --- Graph (unchanged) ---

  getNodes: () => {
    const { tasks } = get()
    const taskList = Object.values(tasks)
    if (taskList.length === 0) return []

    const depthMap = new Map<string, number>()
    const computeDepth = (task: AgentTask): number => {
      if (depthMap.has(task.id)) return depthMap.get(task.id)!
      if (task.dependencies.length === 0) {
        depthMap.set(task.id, 0)
        return 0
      }
      const maxParent = Math.max(
        ...task.dependencies.map((depId) => {
          const dep = tasks[depId]
          return dep ? computeDepth(dep) : 0
        })
      )
      const depth = maxParent + 1
      depthMap.set(task.id, depth)
      return depth
    }
    taskList.forEach(computeDepth)

    const depthGroups = new Map<number, AgentTask[]>()
    for (const task of taskList) {
      const depth = depthMap.get(task.id) ?? 0
      const group = depthGroups.get(depth) ?? []
      group.push(task)
      depthGroups.set(depth, group)
    }

    const nodes: Node[] = []
    for (const [depth, group] of depthGroups) {
      const totalWidth = (group.length - 1) * 250
      const startX = -totalWidth / 2
      group.forEach((task, i) => {
        nodes.push({
          id: task.id,
          type: 'task',
          position: { x: startX + i * 250, y: depth * 150 },
          data: {
            description: task.description,
            taskType: task.type,
            status: task.status,
            toolInUse: task.toolInUse
          }
        })
      })
    }
    return nodes
  },

  getEdges: () => {
    const { tasks } = get()
    const edges: Edge[] = []
    for (const task of Object.values(tasks)) {
      for (const dep of task.dependencies) {
        const depTask = tasks[dep]
        edges.push({
          id: `${dep}->${task.id}`,
          source: dep,
          target: task.id,
          animated: depTask?.status === 'running'
        })
      }
    }
    return edges
  }
}))

import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

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
  | { type: 'chat:error'; error: string }

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
  model: 'default' | 'sonnet' | 'opus' | 'haiku'
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

export type AppMode = 'build' | 'chat'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: Array<{ name: string; input: string }>
  timestamp: number
  isStreaming?: boolean
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

  // Display & connectivity actions
  setUIScale: (scale: number) => void
  setGitHub: (status: Partial<GitHubStatus>) => void
  setClaudeConnectivity: (status: Partial<ClaudeConnectivity>) => void

  // New actions
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  retryTask: (taskId: string) => void
  undoLastIntent: () => void
  runQuickAction: (action: 'commit' | 'test' | 'run' | 'undo' | 'push') => void
  setDevServer: (state: Partial<DevServerState>) => void
  addDevServerOutput: (line: string) => void
  refreshFileChanges: () => void
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
  mode: 'build',
  chatMessages: [],
  chatSessionId: null,
  chatStreaming: false,

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
          return {
            architectStatus: 'done',
            tasks: Object.fromEntries(event.tasks.map((t) => [t.id, t])),
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
        set({ chatSessionId: event.sessionId })
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
          return { chatMessages: msgs }
        })
        break

      case 'chat:done':
        set((state) => {
          const msgs = state.chatMessages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m
          )
          return { chatMessages: msgs, chatStreaming: false }
        })
        break

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
    set((state) => ({ mode: state.mode === 'build' ? 'chat' : 'build' }))
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
      dangerouslySkipPermissions: permissions.skipPermissions
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
  },

  refreshFileChanges: () => {
    window.api.getFileChanges().then((changes) => {
      if (changes && changes.length > 0) {
        set({ fileChanges: changes })
      }
    })
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

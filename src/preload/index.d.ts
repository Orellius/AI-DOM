import { ElectronAPI } from '@electron-toolkit/preload'

interface AgentTask {
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

type AgentEvent =
  | { type: 'task:created'; task: AgentTask }
  | { type: 'task:started'; taskId: string }
  | { type: 'task:progress'; taskId: string; text: string; toolInUse?: string }
  | { type: 'task:completed'; taskId: string; output: string }
  | { type: 'task:failed'; taskId: string; error: string }
  | { type: 'architect:thinking'; text: string }
  | { type: 'architect:done'; taskCount: number }
  | { type: 'auth:status'; installed: boolean; authenticated: boolean }

interface IntentOptions {
  permissions: { files: boolean; terminal: boolean; search: boolean; skipPermissions: boolean }
  settings: { concurrency: number; maxTurns: number; model: string; cwd: string }
}

interface FileChange {
  path: string
  type: 'created' | 'modified' | 'deleted'
}

interface SnapshotInfo {
  id: string
  intent: string
  timestamp: number
  commitHash: string
}

interface ApiInterface {
  submitIntent: (text: string, options?: IntentOptions) => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
  checkAuth: () => Promise<{ installed: boolean; authenticated: boolean }>
  getProjects: () => Promise<Array<{ name: string; branch: string }>>
  startLogin: () => Promise<{ success: boolean }>
  onAgentEvent: (cb: (event: AgentEvent) => void) => () => void
  loadClaudeMd: () => Promise<string>
  saveClaudeMd: (content: string) => Promise<void>
  updateSettings: (settings: IntentOptions['settings']) => Promise<void>
  selectDirectory: () => Promise<string | null>
  retryTask: (taskId: string) => Promise<void>
  getFileChanges: () => Promise<FileChange[]>
  createSnapshot: (intent: string) => Promise<SnapshotInfo | null>
  restoreSnapshot: (commitHash: string) => Promise<void>
  startDevServer: (command: string) => Promise<void>
  stopDevServer: () => Promise<void>
  onDevServerOutput: (cb: (line: string) => void) => () => void
  runQuickAction: (action: string) => Promise<{ success: boolean; output: string }>
  checkConnectivity: () => Promise<{ connected: boolean; version: string | null }>
  checkGitHub: () => Promise<{ authenticated: boolean; username: string | null; remote: string | null }>
  githubLogin: () => Promise<{ started: boolean }>
  switchProject: (name: string) => Promise<{ success: boolean }>
  getActiveProject: () => Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiInterface
  }
}

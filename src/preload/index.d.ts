import { ElectronAPI } from '@electron-toolkit/preload'

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
  | { type: 'plan:text'; content: string }
  | { type: 'plan:done' }
  | { type: 'plan:error'; error: string }

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

interface ProjectProfile {
  name: string
  language: 'typescript' | 'javascript' | 'rust' | 'python' | 'go' | 'unknown'
  framework: string | null
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'cargo' | 'poetry' | 'pip' | null
  devCommand: string | null
  buildCommand: string | null
  testCommand: string | null
  hasGit: boolean
  branch: string | null
  entryFiles: string[]
}

interface LspStatus {
  running: boolean
  language: 'typescript' | 'javascript' | 'rust' | 'go' | 'python' | null
  diagnosticCount: number
}

interface ProviderInfo {
  id: string
  name: string
  authType: string
  isConnected: boolean
  modelCount: number
}

interface ModelInfo {
  id: string
  provider: string
  displayName: string
  costTier: 'cheap' | 'mid' | 'premium'
  contextWindow: number
  supportsTools: boolean
  supportsStreaming: boolean
  inputCostPer1M: number
  outputCostPer1M: number
}

interface CategoryConfig {
  category: string
  label: string
  description: string
  icon: string
  defaultModel: string
  escalationModel: string
}

interface OptimizerConfig {
  categories: CategoryConfig[]
  models: Array<{ id: string; provider: string; displayName: string; costTier: string }>
}

interface ProjectDiagnosis {
  git: {
    hasGit: boolean
    branch: string | null
    uncommittedCount: number
    unpushedCount: number
    lastCommitMessage: string | null
  }
  stack: {
    language: string
    framework: string | null
    packageManager: string | null
    devCommand: string | null
    buildCommand: string | null
    testCommand: string | null
  }
  pulse: {
    entryFiles: string[]
    diagnosticCount: number
    hasClaudeMd: boolean
    hasPackageJson: boolean
    isInitialized: boolean
  }
  suggestions: string[]
}

export interface FileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

export interface FileContent {
  path: string
  relativePath: string
  content: string
  size: number
  language: string
}

interface ApiInterface {
  submitIntent: (text: string, options?: IntentOptions) => Promise<void>
  approveIntent: () => Promise<void>
  rejectIntent: () => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
  checkAuth: () => Promise<{ installed: boolean; authenticated: boolean }>
  getProjects: () => Promise<Array<{ name: string; path: string; branch: string; isInitialized: boolean }>>
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
  diagnoseProject: () => Promise<ProjectDiagnosis>
  scaffoldProject: (cwd: string) => Promise<{ success: boolean; output: string }>
  switchProject: (path: string) => Promise<{ success: boolean }>
  getActiveProject: () => Promise<string | null>
  addProject: () => Promise<{ success: boolean; projects: Array<{ name: string; path: string; branch: string; isInitialized: boolean }> }>
  removeProject: (path: string) => Promise<{ success: boolean }>
  submitChat: (text: string, options?: { allowedTools?: string[]; maxTurns?: number }) => Promise<void>
  cancelChat: () => Promise<void>
  clearChat: () => Promise<void>
  submitPlanMessage: (text: string) => Promise<void>
  setModel: (model: string) => Promise<void>
  setPermissionTier: (tier: 'normal' | 'bypass') => Promise<void>
  approveDangerousCommand: (id: string) => Promise<void>
  rejectDangerousCommand: (id: string) => Promise<void>
  listSnapshots: () => Promise<SnapshotInfo[]>
  resetOnboarding: () => Promise<{ reset: boolean }>
  // Workspace files (.vibe/)
  getWorkspaceFiles: () => Promise<Record<string, string>>
  readWorkspaceFile: (fileName: string) => Promise<string | null>
  writeWorkspaceFile: (fileName: string, content: string) => Promise<void>
  scaffoldWorkspaceFiles: () => Promise<void>
  getProjectProfile: () => Promise<ProjectProfile | null>
  getLspStatus: () => Promise<LspStatus>
  getDiagnostics: () => Promise<string>
  getIgnorePatterns: () => Promise<string[]>
  // Provider management
  getProvidersList: () => Promise<ProviderInfo[]>
  getConnectedModels: () => Promise<ModelInfo[]>
  testProviderConnection: (providerId: string, apiKey?: string) => Promise<{ connected: boolean }>
  setProviderApiKey: (providerId: string, apiKey: string) => Promise<void>
  detectOllamaModels: () => Promise<ModelInfo[]>
  // Model optimizer
  getOptimizerConfig: () => Promise<OptimizerConfig>
  updateOptimizerConfig: (categories: CategoryConfig[]) => Promise<void>
  // Git modal
  getCurrentBranch: () => Promise<string | null>
  getLocalBranches: () => Promise<string[]>
  getUnpushedCommits: () => Promise<Array<{ hash: string; message: string }>>
  getGitStatus: () => Promise<{ uncommittedCount: number; unpushedCount: number }>
  generateCommitMessage: () => Promise<string>
  commitWithMessage: (message: string) => Promise<{ success: boolean; output: string }>
  pushToBranch: (branch: string) => Promise<{ success: boolean; output: string }>
  // File operations
  listDirectory(relativePath: string): Promise<FileEntry[]>
  readFile(relativePath: string): Promise<FileContent>
  writeFile(relativePath: string, content: string): Promise<void>
  deleteFile(relativePath: string): Promise<void>
  renameFile(oldRelative: string, newName: string): Promise<void>
  createFile(relativePath: string, content?: string): Promise<void>
  createDirectory(relativePath: string): Promise<void>
  // Voice
  transcribeAudio(audioBase64: string): Promise<TranscriptionResult>
  getVoiceConfig(): Promise<VoiceConfig & { localAvailable: boolean; modelDownloaded: boolean; sidecarAvailable?: boolean }>
  updateVoiceConfig(config: Partial<VoiceConfig>): Promise<void>
  downloadWhisperModel(): Promise<void>
  onVoiceDownloadProgress(callback: (pct: number) => void): () => void
  translateText(text: string, sourceLang: string): Promise<{ translated: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiInterface
  }
}

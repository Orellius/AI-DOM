import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  submitIntent: (text: string, options?: unknown) => ipcRenderer.invoke('agent:submit-intent', text, options),
  approveIntent: () => ipcRenderer.invoke('agent:approve-intent'),
  rejectIntent: () => ipcRenderer.invoke('agent:reject-intent'),
  cancelTask: (taskId: string) => ipcRenderer.invoke('agent:cancel-task', taskId),
  checkAuth: () => ipcRenderer.invoke('agent:check-auth'),
  getProjects: () => ipcRenderer.invoke('agent:get-projects'),
  startLogin: () => ipcRenderer.invoke('agent:start-login'),
  onAgentEvent: (cb: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => cb(event)
    ipcRenderer.on('agent:event', listener)
    return () => { ipcRenderer.removeListener('agent:event', listener) }
  },
  loadClaudeMd: () => ipcRenderer.invoke('agent:load-claude-md'),
  saveClaudeMd: (content: string) => ipcRenderer.invoke('agent:save-claude-md', content),
  updateSettings: (settings: unknown) => ipcRenderer.invoke('agent:update-settings', settings),
  selectDirectory: () => ipcRenderer.invoke('agent:select-directory'),
  retryTask: (taskId: string) => ipcRenderer.invoke('agent:retry-task', taskId),
  getFileChanges: () => ipcRenderer.invoke('agent:get-file-changes'),
  createSnapshot: (intent: string) => ipcRenderer.invoke('agent:create-snapshot', intent),
  restoreSnapshot: (commitHash: string) => ipcRenderer.invoke('agent:restore-snapshot', commitHash),
  startDevServer: (command: string) => ipcRenderer.invoke('agent:start-dev-server', command),
  stopDevServer: () => ipcRenderer.invoke('agent:stop-dev-server'),
  onDevServerOutput: (cb: (line: string) => void) => {
    const listener = (_: unknown, line: string) => cb(line)
    ipcRenderer.on('dev-server:output', listener)
    return () => { ipcRenderer.removeListener('dev-server:output', listener) }
  },
  runQuickAction: (action: string) => ipcRenderer.invoke('agent:quick-action', action),
  checkConnectivity: () => ipcRenderer.invoke('agent:check-connectivity'),
  checkGitHub: () => ipcRenderer.invoke('agent:check-github'),
  githubLogin: () => ipcRenderer.invoke('agent:github-login'),
  diagnoseProject: () => ipcRenderer.invoke('agent:diagnose-project'),
  scaffoldProject: (cwd: string) => ipcRenderer.invoke('agent:scaffold-project', cwd),
  switchProject: (path: string) => ipcRenderer.invoke('agent:switch-project', path),
  getActiveProject: () => ipcRenderer.invoke('agent:get-active-project'),
  addProject: () => ipcRenderer.invoke('agent:add-project'),
  removeProject: (path: string) => ipcRenderer.invoke('agent:remove-project', path),
  submitChat: (text: string, options?: { allowedTools?: string[]; maxTurns?: number }) =>
    ipcRenderer.invoke('agent:submit-chat', text, options),
  cancelChat: () => ipcRenderer.invoke('agent:cancel-chat'),
  clearChat: () => ipcRenderer.invoke('agent:clear-chat'),
  submitPlanMessage: (text: string) => ipcRenderer.invoke('agent:submit-plan-message', text),
  setModel: (model: string) => ipcRenderer.invoke('agent:set-model', model),
  setPermissionTier: (tier: 'normal' | 'bypass') => ipcRenderer.invoke('agent:set-permission-tier', tier),
  approveDangerousCommand: (id: string) => ipcRenderer.invoke('agent:approve-dangerous-command', id),
  rejectDangerousCommand: (id: string) => ipcRenderer.invoke('agent:reject-dangerous-command', id),
  listSnapshots: () => ipcRenderer.invoke('agent:list-snapshots'),
  resetOnboarding: () => ipcRenderer.invoke('agent:reset-onboarding'),
  // Workspace files (.vibe/)
  getWorkspaceFiles: () => ipcRenderer.invoke('agent:get-workspace-files'),
  readWorkspaceFile: (fileName: string) => ipcRenderer.invoke('agent:read-workspace-file', fileName),
  writeWorkspaceFile: (fileName: string, content: string) =>
    ipcRenderer.invoke('agent:write-workspace-file', fileName, content),
  scaffoldWorkspaceFiles: () => ipcRenderer.invoke('agent:scaffold-workspace-files'),
  getProjectProfile: () => ipcRenderer.invoke('agent:get-project-profile'),
  getLspStatus: () => ipcRenderer.invoke('agent:get-lsp-status'),
  getDiagnostics: () => ipcRenderer.invoke('agent:get-diagnostics'),
  getIgnorePatterns: () => ipcRenderer.invoke('agent:get-ignore-patterns'),
  // Provider management
  getProvidersList: () => ipcRenderer.invoke('agent:get-providers'),
  getConnectedModels: () => ipcRenderer.invoke('agent:get-connected-models'),
  testProviderConnection: (providerId: string, apiKey?: string) =>
    ipcRenderer.invoke('agent:test-provider-connection', providerId, apiKey),
  setProviderApiKey: (providerId: string, apiKey: string) =>
    ipcRenderer.invoke('agent:set-provider-api-key', providerId, apiKey),
  detectOllamaModels: () => ipcRenderer.invoke('agent:detect-ollama-models'),
  // Model optimizer
  getOptimizerConfig: () => ipcRenderer.invoke('agent:get-optimizer-config'),
  updateOptimizerConfig: (categories: unknown[]) =>
    ipcRenderer.invoke('agent:update-optimizer-config', categories),
  // Git modal
  getCurrentBranch: () => ipcRenderer.invoke('agent:get-current-branch'),
  getLocalBranches: () => ipcRenderer.invoke('agent:get-local-branches'),
  getUnpushedCommits: () => ipcRenderer.invoke('agent:get-unpushed-commits'),
  getGitStatus: () => ipcRenderer.invoke('agent:get-git-status'),
  generateCommitMessage: () => ipcRenderer.invoke('agent:generate-commit-message'),
  commitWithMessage: (message: string) => ipcRenderer.invoke('agent:commit-with-message', message),
  pushToBranch: (branch: string) => ipcRenderer.invoke('agent:push-to-branch', branch),
  // File operations
  listDirectory: (relativePath: string) => ipcRenderer.invoke('agent:list-directory', relativePath),
  readFile: (relativePath: string) => ipcRenderer.invoke('agent:read-file', relativePath),
  writeFile: (relativePath: string, content: string) => ipcRenderer.invoke('agent:write-file', relativePath, content),
  deleteFile: (relativePath: string) => ipcRenderer.invoke('agent:delete-file', relativePath),
  renameFile: (oldRelative: string, newName: string) => ipcRenderer.invoke('agent:rename-file', oldRelative, newName),
  createFile: (relativePath: string, content?: string) => ipcRenderer.invoke('agent:create-file', relativePath, content),
  createDirectory: (relativePath: string) => ipcRenderer.invoke('agent:create-directory', relativePath),
  // Voice
  transcribeAudio: (audioBase64: string) => ipcRenderer.invoke('agent:transcribe-audio', audioBase64),
  getVoiceConfig: () => ipcRenderer.invoke('agent:get-voice-config'),
  updateVoiceConfig: (config: any) => ipcRenderer.invoke('agent:update-voice-config', config),
  downloadWhisperModel: () => ipcRenderer.invoke('agent:download-whisper-model'),
  onVoiceDownloadProgress: (callback: (pct: number) => void) => {
    const handler = (_event: any, pct: number) => callback(pct)
    ipcRenderer.on('voice:download-progress', handler)
    return () => ipcRenderer.removeListener('voice:download-progress', handler)
  },
  translateText: (text: string, sourceLang: string) =>
    ipcRenderer.invoke('agent:translate-text', text, sourceLang),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

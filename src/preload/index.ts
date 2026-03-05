import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  submitIntent: (text: string, options?: unknown) => ipcRenderer.invoke('agent:submit-intent', text, options),
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
  switchProject: (name: string) => ipcRenderer.invoke('agent:switch-project', name),
  getActiveProject: () => ipcRenderer.invoke('agent:get-active-project'),
  submitChat: (text: string, options?: { allowedTools?: string[]; maxTurns?: number }) =>
    ipcRenderer.invoke('agent:submit-chat', text, options),
  cancelChat: () => ipcRenderer.invoke('agent:cancel-chat'),
  clearChat: () => ipcRenderer.invoke('agent:clear-chat'),
  setModel: (model: string) => ipcRenderer.invoke('agent:set-model', model),
  setPermissionTier: (tier: 'normal' | 'bypass') => ipcRenderer.invoke('agent:set-permission-tier', tier),
  approveDangerousCommand: (id: string) => ipcRenderer.invoke('agent:approve-dangerous-command', id),
  rejectDangerousCommand: (id: string) => ipcRenderer.invoke('agent:reject-dangerous-command', id),
  listSnapshots: () => ipcRenderer.invoke('agent:list-snapshots'),
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

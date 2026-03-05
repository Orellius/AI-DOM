import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { AgentOrchestrator, AgentEvent } from './orchestrator'
import { ClaudeCli } from './claude-cli'

export function registerIpcHandlers(
  orchestrator: AgentOrchestrator,
  mainWindow: BrowserWindow
): void {
  // Forward all orchestrator events to the renderer
  orchestrator.on('event', (event: AgentEvent) => {
    console.log('[VIBE:IPC] forwarding event to renderer:', event.type)
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('agent:event', event)
  })

  // Forward dev server output to renderer
  orchestrator.on('dev-server:output', (line: string) => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('dev-server:output', line)
  })

  ipcMain.handle('agent:submit-intent', async (_event, text: unknown, options: unknown) => {
    console.log('[VIBE:IPC] agent:submit-intent received:', text)
    if (typeof text !== 'string' || !text.trim()) {
      console.error('[VIBE:IPC] invalid intent text:', text)
      throw new Error('Invalid intent: must be a non-empty string')
    }
    try {
      await orchestrator.submitIntent(text, options as Record<string, unknown> | undefined)
      console.log('[VIBE:IPC] submitIntent completed successfully')
    } catch (err) {
      console.error('[VIBE:IPC] submitIntent threw:', err)
      throw err
    }
  })

  ipcMain.handle('agent:cancel-task', (_event, taskId: unknown) => {
    if (typeof taskId !== 'string' || !taskId.trim()) {
      throw new Error('Invalid task ID')
    }
    orchestrator.cancelTask(taskId)
  })

  ipcMain.handle('agent:check-auth', async () => {
    return ClaudeCli.checkAuth()
  })

  ipcMain.handle('agent:start-login', async () => {
    return ClaudeCli.startLogin()
  })

  ipcMain.handle('agent:get-projects', () => {
    return orchestrator.getProjects()
  })

  ipcMain.handle('agent:load-claude-md', () => {
    const cwd = orchestrator.getCwd()
    const filePath = join(cwd, 'CLAUDE.md')
    if (!existsSync(filePath)) return ''
    return readFileSync(filePath, 'utf8')
  })

  ipcMain.handle('agent:save-claude-md', (_event, content: unknown) => {
    if (typeof content !== 'string') throw new Error('Content must be a string')
    if (!content.trim()) throw new Error('Content cannot be empty')
    const cwd = orchestrator.getCwd()
    writeFileSync(join(cwd, 'CLAUDE.md'), content, 'utf8')
  })

  ipcMain.handle('agent:update-settings', (_event, settings: unknown) => {
    if (!settings || typeof settings !== 'object') throw new Error('Invalid settings')
    orchestrator.updateSettings(settings as Record<string, unknown>)
  })

  ipcMain.handle('agent:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // --- Connectivity & GitHub ---

  ipcMain.handle('agent:check-connectivity', async () => {
    return ClaudeCli.checkConnectivity()
  })

  ipcMain.handle('agent:check-github', () => {
    const auth = orchestrator.checkGitHub()
    const remote = orchestrator.getGitRemote()
    return { ...auth, remote }
  })

  ipcMain.handle('agent:github-login', () => {
    const { spawn: spawnProc } = require('child_process')
    const proc = spawnProc('gh', ['auth', 'login', '--web'], {
      stdio: 'pipe',
      env: { ...process.env }
    })
    // Fire and forget — user completes in browser
    proc.on('error', () => { /* ignore */ })
    return { started: true }
  })

  // --- New handlers ---

  ipcMain.handle('agent:retry-task', (_event, taskId: unknown) => {
    if (typeof taskId !== 'string' || !taskId.trim()) throw new Error('Invalid task ID')
    orchestrator.retryTask(taskId)
  })

  ipcMain.handle('agent:get-file-changes', () => {
    return orchestrator.getFileChanges()
  })

  ipcMain.handle('agent:create-snapshot', (_event, intent: unknown) => {
    if (typeof intent !== 'string') throw new Error('Intent must be a string')
    return orchestrator.createSnapshot(intent)
  })

  ipcMain.handle('agent:restore-snapshot', (_event, commitHash: unknown) => {
    if (typeof commitHash !== 'string' || !/^[a-f0-9]{7,40}$/.test(commitHash)) {
      throw new Error('Invalid commit hash')
    }
    orchestrator.restoreSnapshot(commitHash)
  })

  ipcMain.handle('agent:start-dev-server', (_event, command: unknown) => {
    if (typeof command !== 'string' || !command.trim()) throw new Error('Invalid command')
    orchestrator.startDevServer(command)
  })

  ipcMain.handle('agent:stop-dev-server', () => {
    orchestrator.stopDevServer()
  })

  ipcMain.handle('agent:quick-action', (_event, action: unknown) => {
    if (typeof action !== 'string') throw new Error('Invalid action')
    return orchestrator.runQuickAction(action)
  })

  ipcMain.handle('agent:switch-project', (_event, name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Invalid project name')
    // Prevent path traversal
    if (name.includes('/') || name.includes('..')) throw new Error('Invalid project name')
    return orchestrator.switchProject(name)
  })

  ipcMain.handle('agent:get-active-project', () => {
    return orchestrator.getActiveProject()
  })

  // --- Chat mode ---

  ipcMain.handle('agent:submit-chat', (_event, text: unknown, options: unknown) => {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Invalid chat text: must be a non-empty string')
    }
    orchestrator.submitChat(text, options as { allowedTools?: string[]; maxTurns?: number } | undefined)
  })

  ipcMain.handle('agent:cancel-chat', () => {
    orchestrator.cancelChat()
  })

  ipcMain.handle('agent:clear-chat', () => {
    orchestrator.clearChatSession()
  })
}

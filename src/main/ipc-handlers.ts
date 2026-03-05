import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { AgentOrchestrator, AgentEvent } from './orchestrator'
import { ClaudeCli } from './claude-cli'
import { FileManager } from './file-manager.js'
import { VoiceEngine } from './voice-engine.js'

const fileManager = new FileManager()
const voiceEngine = new VoiceEngine()

// --- Input validation helpers ---

function validateString(val: unknown, name: string, maxLen = 10_000): string {
  if (typeof val !== 'string') throw new Error(`${name} must be a string`)
  const trimmed = val.trim()
  if (!trimmed) throw new Error(`${name} cannot be empty`)
  if (trimmed.length > maxLen) throw new Error(`${name} exceeds max length (${maxLen})`)
  return trimmed
}

function validateEnum<T extends string>(val: unknown, name: string, allowed: Set<T>): T {
  if (typeof val !== 'string') throw new Error(`${name} must be a string`)
  if (!allowed.has(val as T)) throw new Error(`${name} must be one of: ${[...allowed].join(', ')}`)
  return val as T
}

const VALID_QUICK_ACTIONS = new Set(['commit', 'test', 'push', 'run'] as const)

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

  ipcMain.handle('agent:approve-intent', () => {
    orchestrator.approveIntent()
  })

  ipcMain.handle('agent:reject-intent', () => {
    orchestrator.rejectIntent()
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

  ipcMain.handle('agent:set-model', (_event, model: unknown) => {
    if (typeof model !== 'string') throw new Error('Model must be a string')
    orchestrator.setModel(model)
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

  ipcMain.handle('agent:get-current-branch', () => {
    return orchestrator.getCurrentBranch()
  })

  ipcMain.handle('agent:get-local-branches', () => {
    return orchestrator.getLocalBranches()
  })

  ipcMain.handle('agent:get-unpushed-commits', () => {
    return orchestrator.getUnpushedCommits()
  })

  ipcMain.handle('agent:get-git-status', () => {
    return orchestrator.getGitStatus()
  })

  ipcMain.handle('agent:generate-commit-message', async () => {
    return orchestrator.generateCommitMessage()
  })

  ipcMain.handle('agent:commit-with-message', (_event, message: unknown) => {
    const validated = validateString(message, 'commit message', 500)
    return orchestrator.commitWithMessage(validated)
  })

  ipcMain.handle('agent:push-to-branch', (_event, branch: unknown) => {
    const validated = validateString(branch, 'branch name', 200)
    if (!/^[a-zA-Z0-9._\-/]+$/.test(validated)) throw new Error('Invalid branch name')
    return orchestrator.pushToBranch(validated)
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
    const validated = validateEnum(action, 'action', VALID_QUICK_ACTIONS)
    return orchestrator.runQuickAction(validated)
  })

  ipcMain.handle('agent:diagnose-project', () => {
    return orchestrator.diagnoseProject()
  })

  ipcMain.handle('agent:scaffold-project', (_event, cwd: unknown) => {
    if (typeof cwd !== 'string' || !cwd.trim()) throw new Error('Invalid path')
    if (!cwd.startsWith('/')) throw new Error('Path must be absolute')
    return orchestrator.scaffoldProject(cwd)
  })

  ipcMain.handle('agent:switch-project', (_event, absolutePath: unknown) => {
    if (typeof absolutePath !== 'string' || !absolutePath.trim()) throw new Error('Invalid project path')
    // Must be an absolute path
    if (!absolutePath.startsWith('/')) throw new Error('Path must be absolute')
    fileManager.setRoot(absolutePath)
    return orchestrator.switchProject(absolutePath)
  })

  ipcMain.handle('agent:get-active-project', () => {
    return orchestrator.getActiveProject()
  })

  ipcMain.handle('agent:add-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Add Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, projects: orchestrator.getProjects() }
    }
    return orchestrator.addProject(result.filePaths[0])
  })

  ipcMain.handle('agent:remove-project', (_event, absolutePath: unknown) => {
    if (typeof absolutePath !== 'string' || !absolutePath.trim()) throw new Error('Invalid project path')
    if (!absolutePath.startsWith('/')) throw new Error('Path must be absolute')
    return orchestrator.removeProject(absolutePath)
  })

  // --- Chat mode ---

  ipcMain.handle('agent:submit-chat', (_event, text: unknown, options: unknown) => {
    const validated = validateString(text, 'chat text', 50_000)
    // Strip dangerouslySkipPermissions — renderer should not control this
    const safeOpts = options && typeof options === 'object'
      ? { ...(options as Record<string, unknown>), dangerouslySkipPermissions: undefined }
      : undefined
    orchestrator.submitChat(validated, safeOpts as { allowedTools?: string[]; maxTurns?: number } | undefined)
  })

  ipcMain.handle('agent:cancel-chat', () => {
    orchestrator.cancelChat()
  })

  ipcMain.handle('agent:submit-plan-message', (_event, text: unknown) => {
    const validated = validateString(text, 'plan text', 50_000)
    orchestrator.submitPlanMessage(validated)
  })

  ipcMain.handle('agent:clear-chat', () => {
    orchestrator.clearChatSession()
  })

  // --- Permission tier ---

  const VALID_PERMISSION_TIERS = new Set(['normal', 'bypass'] as const)

  ipcMain.handle('agent:set-permission-tier', (_event, tier: unknown) => {
    const validated = validateEnum(tier, 'permission tier', VALID_PERMISSION_TIERS)
    orchestrator.setPermissionTier(validated)
  })

  // --- Command guard ---

  ipcMain.handle('agent:approve-dangerous-command', (_event, id: unknown) => {
    const validated = validateString(id, 'command id', 200)
    orchestrator.approveDangerousCommand(validated)
  })

  ipcMain.handle('agent:reject-dangerous-command', (_event, id: unknown) => {
    const validated = validateString(id, 'command id', 200)
    orchestrator.rejectDangerousCommand(validated)
  })

  ipcMain.handle('agent:list-snapshots', () => {
    return orchestrator.getSnapshotHistory()
  })

  // --- Onboarding reset (dev utility) ---

  ipcMain.handle('agent:reset-onboarding', () => {
    // Clear workspace state so post-onboarding starts fresh
    orchestrator.clearWorkspace()
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        'localStorage.removeItem("vibeflow:onboarding-complete"); true'
      ).catch(() => {})
    }
    return { reset: true }
  })

  // --- Workspace Files (.vibe/) ---

  ipcMain.handle('agent:get-workspace-files', () => {
    return orchestrator.getWorkspaceFiles()
  })

  ipcMain.handle('agent:read-workspace-file', (_event, fileName: unknown) => {
    const validated = validateString(fileName, 'fileName', 100)
    if (!/^[A-Z]+\.md$/.test(validated)) throw new Error('Invalid workspace file name')
    return orchestrator.readWorkspaceFile(validated)
  })

  ipcMain.handle('agent:write-workspace-file', (_event, fileName: unknown, content: unknown) => {
    const validatedName = validateString(fileName, 'fileName', 100)
    if (!/^[A-Z]+\.md$/.test(validatedName)) throw new Error('Invalid workspace file name')
    if (typeof content !== 'string') throw new Error('Content must be a string')
    orchestrator.writeWorkspaceFile(validatedName, content)
  })

  ipcMain.handle('agent:scaffold-workspace-files', () => {
    orchestrator.scaffoldWorkspaceFilesForCwd()
  })

  // --- Intelligence Layer ---

  ipcMain.handle('agent:get-project-profile', () => {
    return orchestrator.getProjectProfile()
  })

  ipcMain.handle('agent:get-lsp-status', () => {
    return orchestrator.getLspStatus()
  })

  ipcMain.handle('agent:get-diagnostics', () => {
    return orchestrator.getDiagnosticsSummary()
  })

  ipcMain.handle('agent:get-ignore-patterns', () => {
    return orchestrator.getIgnorePatterns()
  })

  // --- Provider Management ---

  ipcMain.handle('agent:get-providers', () => {
    return orchestrator.getProviders()
  })

  ipcMain.handle('agent:get-connected-models', () => {
    return orchestrator.getConnectedModels()
  })

  ipcMain.handle('agent:test-provider-connection', async (_event, providerId: unknown, apiKey: unknown) => {
    if (typeof providerId !== 'string') throw new Error('Provider ID must be a string')
    const key = typeof apiKey === 'string' ? apiKey : undefined
    return orchestrator.testProviderConnection(providerId as 'anthropic' | 'openai' | 'google' | 'ollama', key)
  })

  ipcMain.handle('agent:set-provider-api-key', (_event, providerId: unknown, apiKey: unknown) => {
    if (typeof providerId !== 'string') throw new Error('Provider ID must be a string')
    if (typeof apiKey !== 'string') throw new Error('API key must be a string')
    orchestrator.setProviderApiKey(providerId as 'anthropic' | 'openai' | 'google' | 'ollama', apiKey)
  })

  ipcMain.handle('agent:detect-ollama-models', async () => {
    return orchestrator.detectOllamaModels()
  })

  // --- Model Optimizer ---

  ipcMain.handle('agent:get-optimizer-config', () => {
    return orchestrator.getOptimizerConfig()
  })

  ipcMain.handle('agent:update-optimizer-config', (_event, categories: unknown) => {
    if (!Array.isArray(categories)) throw new Error('Categories must be an array')
    orchestrator.updateOptimizerConfig(categories)
  })

  // --- File operations ---

  ipcMain.handle('agent:list-directory', async (_e, relativePath: string) => {
    validateString(relativePath, 'relativePath', 1000)
    return fileManager.listDirectory(relativePath)
  })

  ipcMain.handle('agent:read-file', async (_e, relativePath: string) => {
    validateString(relativePath, 'relativePath', 1000)
    return fileManager.readFile(relativePath)
  })

  ipcMain.handle('agent:write-file', async (_e, relativePath: string, content: string) => {
    validateString(relativePath, 'relativePath', 1000)
    if (typeof content !== 'string') throw new Error('Content must be a string')
    return fileManager.writeFile(relativePath, content)
  })

  ipcMain.handle('agent:delete-file', async (_e, relativePath: string) => {
    validateString(relativePath, 'relativePath', 1000)
    return fileManager.deleteFile(relativePath)
  })

  ipcMain.handle('agent:rename-file', async (_e, oldRelative: string, newName: string) => {
    validateString(oldRelative, 'oldRelative', 1000)
    validateString(newName, 'newName', 255)
    return fileManager.renameFile(oldRelative, newName)
  })

  ipcMain.handle('agent:create-file', async (_e, relativePath: string, content?: string) => {
    validateString(relativePath, 'relativePath', 1000)
    if (content !== undefined && typeof content !== 'string') throw new Error('Content must be a string')
    return fileManager.createFile(relativePath, content)
  })

  ipcMain.handle('agent:create-directory', async (_e, relativePath: string) => {
    validateString(relativePath, 'relativePath', 1000)
    return fileManager.createDirectory(relativePath)
  })

  // --- Voice transcription ---

  ipcMain.handle('agent:transcribe-audio', async (_e, audioBase64: unknown) => {
    if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
      throw new Error('Audio data required')
    }
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    return voiceEngine.transcribe(audioBuffer)
  })

  ipcMain.handle('agent:get-voice-config', async () => {
    const config = voiceEngine.getConfig()
    const local = voiceEngine.checkLocalAvailability()
    const sidecarAvailable = voiceEngine.checkSidecarAvailability()
    return { ...config, localAvailable: local.available, modelDownloaded: local.modelDownloaded, binaryPath: local.binaryPath, sidecarAvailable }
  })

  ipcMain.handle('agent:update-voice-config', async (_e, config: unknown) => {
    if (typeof config !== 'object' || config === null) throw new Error('Config must be an object')
    voiceEngine.updateConfig(config as Record<string, unknown>)
  })

  ipcMain.handle('agent:translate-text', async (_e, text: unknown, sourceLang: unknown) => {
    const validatedText = validateString(text, 'text', 50_000)
    const validatedLang = validateString(sourceLang, 'sourceLang', 10)
    const result = await voiceEngine.translateToEnglish(validatedText, validatedLang)
    return { translated: result.translated }
  })

  ipcMain.handle('agent:download-whisper-model', async () => {
    await voiceEngine.downloadModel((pct) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice:download-progress', pct)
      }
    })
  })
}

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { AgentOrchestrator } from './orchestrator'
import { registerIpcHandlers } from './ipc-handlers'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0c0c0c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only allow http/https URLs to prevent file:// and custom protocol attacks
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Invalid URL — silently block
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.orellius.vibeflow-terminal')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()
  const orchestrator = new AgentOrchestrator()
  registerIpcHandlers(orchestrator, mainWindow)

  // Dev utility: set VIBE_RESET_ONBOARDING=1 to force re-show onboarding
  if (process.env['VIBE_RESET_ONBOARDING'] === '1') {
    orchestrator.clearWorkspace()
    let didReset = false
    mainWindow.webContents.on('dom-ready', () => {
      if (didReset) return
      didReset = true
      mainWindow.webContents.executeJavaScript(
        'localStorage.removeItem("vibeflow:onboarding-complete"); location.reload();'
      ).catch(() => {})
    })
  }

  // Clean shutdown: destroy SDK sessions before quit
  app.on('before-quit', () => {
    orchestrator.destroy()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

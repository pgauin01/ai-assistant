import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import net from 'net'

// --- 🛑 MEMORY & STEALTH OPTIMIZATIONS 🛑 ---
// Disables the heavy GPU rendering process, saving ~100MB+ of RAM
app.disableHardwareAcceleration()
// Prevents fallback software rendering
app.commandLine.appendSwitch('disable-software-rasterizer')
// --------------------------------------------

// Prevent EIO crashes if the hidden terminal detaches
process.stdout?.on?.('error', () => {})
process.stderr?.on?.('error', () => {})

// Silently swallow all fatal crashes so no Windows popups appear
process.on('uncaughtException', (err) => {
  // Do nothing. Stay silent.
})
process.on('unhandledRejection', (reason, promise) => {
  // Do nothing. Stay silent.
})

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800, // Keep it narrow, just for the command bar
    height: 800, // Keep it short, just for the command bar
    show: false, // Don't show until ready
    transparent: true, // Translucent background
    frame: false, // No window controls
    alwaysOnTop: true, // Float above all
    hasShadow: false,
    resizable: false,
    opacity: 0,
    skipTaskbar: true, // Hides it from the Windows taskbar
    type: 'toolbar',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false, // CRITICAL: Prevents frontend from running OS commands
      contextIsolation: true, // CRITICAL: Isolates your preload scripts
      webSecurity: true // Enforces CORS and standard browser security
    }
  })

  // Hides the window from screen capture and screen sharing.
  mainWindow.setContentProtection(true)
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.webContents.openDevTools({ mode: 'detach' })

  // Start in "click-through" mode
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setIgnoreMouseEvents(false)
  })

  // Wait 60ms for Windows to apply the screen capture block, then make it visible
  setTimeout(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.setOpacity(1)
    }
  }, 100)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Add this variable outside the scope to keep track of the backend
let backendProcess = null
const BACKEND_EXE_NAME = 'NVIDIA Container.exe'
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = 8000

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
  process.exit(0)
}

function isPortInUse(port, host = BACKEND_HOST, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const finish = (inUse) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(inUse)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

function resolveBackendPath() {
  if (app.isPackaged) {
    return join(process.resourcesPath, BACKEND_EXE_NAME)
  }

  const devCandidates = [
    join(app.getAppPath(), 'resources', BACKEND_EXE_NAME),
    join(process.cwd(), 'resources', BACKEND_EXE_NAME)
  ]

  return devCandidates.find((candidate) => existsSync(candidate)) ?? devCandidates[0]
}
async function launchBackend() {
  const backendPath = resolveBackendPath()

  if (!existsSync(backendPath)) {
    console.error(`[backend] Executable not found: ${backendPath}`)
    return
  }

  if (await isPortInUse(BACKEND_PORT, BACKEND_HOST)) {
    console.warn(`[backend] Port ${BACKEND_PORT} already in use. Skipping backend launch.`)
    return
  }

  // 2. Spawn the process silently in the background
  // 2. Spawn the process silently in the background
  try {
    backendProcess = spawn(backendPath, [], {
      cwd: dirname(backendPath), // CRITICAL: Sets working directory so it finds the FAISS DB!
      detached: false,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    // Capture standard info logs
    backendProcess.stdout.on('data', (data) => {
      const msg = `[PYTHON INFO]: ${data.toString().trim()}`
      if (mainWindow)
        mainWindow.webContents
          .executeJavaScript(`console.log(\`${msg.replace(/`/g, '\\`')}\`)`)
          .catch(() => {})
    })

    // Capture crash logs and Python tracebacks (This is the golden ticket)
    backendProcess.stderr.on('data', (data) => {
      const msg = `[PYTHON ERROR]: ${data.toString().trim()}`
      if (mainWindow)
        mainWindow.webContents
          .executeJavaScript(`console.error(\`${msg.replace(/`/g, '\\`')}\`)`)
          .catch(() => {})
    })

    // Check if it's dying immediately
    backendProcess.on('close', (code) => {
      if (mainWindow)
        mainWindow.webContents
          .executeJavaScript(`console.warn('[PYTHON STATUS] Backend exited with code: ${code}')`)
          .catch(() => {})
    })

    console.log('Ghost backend launched successfully.')
  } catch (err) {
    console.error('Failed to start backend:', err)
    return
  }

  if (!backendProcess) return

  backendProcess.on('error', (err) => {
    console.error(`[backend] Failed to start ${backendPath}:`, err)
  })

  backendProcess.on('exit', (code, signal) => {
    console.log(`[backend] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
  })

  console.log(`[backend] launched: ${backendPath}`)
}

// Spoof the internal Windows grouping ID
app.setAppUserModelId('com.nvidia.container.helper')

app.whenReady().then(() => {
  launchBackend().catch((err) => {
    console.error('[backend] launch error:', err)
  })

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!mainWindow.isVisible()) mainWindow.show()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  ipcMain.on('move-window-by', (event, dx, dy) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const [x, y] = win.getPosition()
    const nx = Math.round(x + Number(dx || 0))
    const ny = Math.round(y + Number(dy || 0))
    win.setPosition(nx, ny)
  })

  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // --- THE MAGIC SHORTCUT ---
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow.isFocused()) {
      // Hide and restore click-through
      mainWindow.hide()
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      // Show, grab focus, disable click-through
      mainWindow.show()
      mainWindow.setIgnoreMouseEvents(false)
      mainWindow.focus()
      // Tell React to focus the actual HTML input element
      mainWindow.webContents.send('focus-input')
    }
  })

  // Listen for React telling us to hide (e.g., when user presses Escape or Enter)
  ipcMain.on('hide-overlay', () => {
    mainWindow.hide()
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
  })

  // 1. Register the Global Hotkey (Ctrl+Space or Cmd+Space)
  globalShortcut.register('CommandOrControl+Space', () => {
    // 2. Send an IPC message to the React frontend
    if (mainWindow) {
      mainWindow.webContents.send('toggle-mic')
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()

  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

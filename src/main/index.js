import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 200, // Keep it short, just for the command bar
    show: false, // Don't show until ready
    transparent: true, // Translucent background
    frame: false, // No window controls
    alwaysOnTop: true, // Float above all
    hasShadow: false,
    resizable: false,
    height: 800,
    alwaysOnTop: true,
    skipTaskbar: true, // Hides it from the Windows taskbar
    type: 'toolbar',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Hides the window from screen capture and screen sharing.
  mainWindow.setContentProtection(true)
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  // mainWindow.webContents.openDevTools({ mode: 'detach' })

  // Start in "click-through" mode
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setIgnoreMouseEvents(false)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Add this variable outside the scope to keep track of the backend
let backendProcess = null
app.whenReady().then(() => {
  // 1. Determine the path to the executable (Handles both Dev and Production)
  const isDev = !app.isPackaged
  const backendPath = isDev
    ? join(app.getAppPath(), 'resources', 'WindowsAudioDeviceHost.exe')
    : join(process.resourcesPath, 'WindowsAudioDeviceHost.exe')

  // 2. Spawn the process silently in the background
  try {
    backendProcess = spawn(backendPath, [], {
      detached: false, // Binds it to the Electron app's lifecycle
      stdio: 'ignore' // Mutes all terminal outputs for maximum stealth
    })
    console.log('Ghost backend launched successfully.')
  } catch (err) {
    console.error('Failed to start backend:', err)
  }
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
  app.on('will-quit', () => {
    // Clean up the shortcuts when the app closes
    globalShortcut.unregisterAll()
  })
  // 3. CRITICAL: Kill the hidden backend when you close the Electron app!
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()

    if (backendProcess) {
      backendProcess.kill() // Assassinates the hidden WindowsAudioDeviceHost
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

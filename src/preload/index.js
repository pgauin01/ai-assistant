import { contextBridge, ipcRenderer } from 'electron'

const api = {
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  onFocusInput: (callback) => ipcRenderer.on('focus-input', callback),
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window-by', dx, dy)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}

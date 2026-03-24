import { contextBridge, ipcRenderer } from 'electron'

const api = {
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  onFocusInput: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('focus-input', listener)
    return () => ipcRenderer.removeListener('focus-input', listener)
  },
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window-by', dx, dy),
  onToggleMic: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('toggle-mic', listener)
    return () => ipcRenderer.removeListener('toggle-mic', listener)
  },
  wiretapSystem: () => ipcRenderer.invoke('wiretap-system')
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

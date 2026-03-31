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
  wiretapSystem: () => ipcRenderer.invoke('wiretap-system'),
  onToggleLiveTranscription: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('toggle-live-transcription', listener)
    return () => ipcRenderer.removeListener('toggle-live-transcription', listener)
  },
  onTriggerSmartVision: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('trigger-smart-vision', listener)
    return () => ipcRenderer.removeListener('trigger-smart-vision', listener)
  },
  onMoondreamTrigger: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('trigger-moondream', listener)
    return () => ipcRenderer.removeListener('trigger-moondream', listener)
  },
  startLiveSystemCapture: () => ipcRenderer.send('start-live-system-capture'),
  stopLiveSystemCapture: () => ipcRenderer.send('stop-live-system-capture'),
  saveAndExit: (markdownContent) => ipcRenderer.send('save-and-exit', markdownContent),
  onLiveSystemAudioChunk: (callback) => {
    const listener = (event, chunk) => callback(chunk)
    ipcRenderer.on('live-system-audio-chunk', listener)
    return () => ipcRenderer.removeListener('live-system-audio-chunk', listener)
  }
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

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AdouApi, BackendInfo } from '../shared/types'

const api: AdouApi = {
  getBackendInfo: () => ipcRenderer.invoke('backend:info'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  onBackendStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, info: BackendInfo): void => callback(info)
    ipcRenderer.on('backend:status', listener)
    return () => {
      ipcRenderer.removeListener('backend:status', listener)
    }
  },
  pickDocument: () => ipcRenderer.invoke('dialog:open-document'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file as File)
    } catch {
      return ''
    }
  },
  revealPath: (path) => ipcRenderer.invoke('file:reveal', path),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getVersions: () => ipcRenderer.invoke('app:versions')
}

contextBridge.exposeInMainWorld('adou', api)

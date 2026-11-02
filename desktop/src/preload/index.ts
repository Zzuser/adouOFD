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
  pickDocuments: () => ipcRenderer.invoke('dialog:open-documents'),
  pickConversionTarget: (options) => ipcRenderer.invoke('dialog:save-conversion', options),
  pickMergeTarget: (options) => ipcRenderer.invoke('dialog:save-merge', options),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file as File)
    } catch {
      return ''
    }
  },
  revealPath: (path) => ipcRenderer.invoke('file:reveal', path),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getVersions: () => ipcRenderer.invoke('app:versions'),
  takePendingFiles: () => ipcRenderer.invoke('app:take-pending-files'),
  onOpenFiles: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('app:open-files-available', listener)
    return () => {
      ipcRenderer.removeListener('app:open-files-available', listener)
    }
  },
  getWindowsIntegration: () => ipcRenderer.invoke('windows:integration'),
  registerWindowsIntegration: () => ipcRenderer.invoke('windows:register'),
  unregisterWindowsIntegration: () => ipcRenderer.invoke('windows:unregister'),
  openDefaultAppChoice: () => ipcRenderer.invoke('windows:open-default-choice'),
  openDefaultAppsSettings: () => ipcRenderer.invoke('windows:open-default-apps'),
  readLegalNotices: () => ipcRenderer.invoke('legal:read'),
  revealLegalNotices: () => ipcRenderer.invoke('legal:reveal'),
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  printDocument: (options) => ipcRenderer.invoke('document:print', options)
}

contextBridge.exposeInMainWorld('adou', api)

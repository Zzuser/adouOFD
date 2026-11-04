import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AdouApi, BackendInfo, UpdateProgress } from '../shared/types'

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
  pickPageTarget: (options) => ipcRenderer.invoke('dialog:save-page-tool', options),
  pickDirectory: (options) => ipcRenderer.invoke('dialog:pick-directory', options),
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
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (download) => ipcRenderer.invoke('update:download', download),
  cancelUpdateDownload: () => ipcRenderer.invoke('update:cancel'),
  onUpdateProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: UpdateProgress): void =>
      callback(progress)
    ipcRenderer.on('update:progress', listener)
    return () => {
      ipcRenderer.removeListener('update:progress', listener)
    }
  },
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
  printDocument: (options) => ipcRenderer.invoke('document:print', options),
  listRecentFiles: () => ipcRenderer.invoke('recent:list'),
  addRecentFile: (entry) => ipcRenderer.invoke('recent:add', entry),
  removeRecentFile: (path) => ipcRenderer.invoke('recent:remove', path),
  clearRecentFiles: () => ipcRenderer.invoke('recent:clear'),
  readTextFile: (path) => ipcRenderer.invoke('text:read', path),
  writeTextFile: (options) => ipcRenderer.invoke('text:write', options),
  createTextFile: (kind) => ipcRenderer.invoke('dialog:new-text', kind),
  exportTextPdf: (options) => ipcRenderer.invoke('text:export-pdf', options),
  setUnsavedTextCount: (count) => ipcRenderer.send('text:unsaved-count', count)
}

contextBridge.exposeInMainWorld('adou', api)

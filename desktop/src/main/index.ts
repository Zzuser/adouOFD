import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BackendManager } from './backend'
import type { BackendInfo } from '../shared/types'

const APP_NAME = '阿豆OFD'
app.setName(APP_NAME)
app.setPath('userData', join(app.getPath('appData'), 'adou-ofd'))
app.setAppUserModelId('com.adou.ofd')

let mainWindow: BrowserWindow | null = null
let backend: BackendManager | null = null
let quitting = false

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))

    backend = new BackendManager()
    backend.onChange((info: BackendInfo) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backend:status', info)
      }
    })

    registerIpc()
    createWindow()
    void backend.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    mainWindow?.hide()
    void (async () => {
      try {
        await backend?.stop()
      } finally {
        app.quit()
      }
    })()
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#f6f4ec',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  mainWindow = window

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
    }
  })
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.selectionText.trim()) {
      return
    }
    Menu.buildFromTemplate([
      { label: '复制选中文字', role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { type: 'separator' },
      {
        label: '取消选择',
        click: () => {
          void window.webContents
            .executeJavaScript('window.getSelection()?.removeAllRanges(); true')
            .catch(() => undefined)
        }
      }
    ]).popup({ window })
  })

  if (process.env.ADOU_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('backend:info', () => backend?.info)
  ipcMain.handle('backend:restart', async () => {
    if (!backend) return null
    return backend.restart()
  })

  ipcMain.handle('dialog:open-document', async () => {
    // 自动化冒烟/压测：显式设置环境变量时跳过原生对话框
    const autoOpen = process.env.ADOU_TEST_OPEN_FILE
    if (autoOpen && existsSync(autoOpen)) {
      return autoOpen
    }
    const options: Electron.OpenDialogOptions = {
      title: '打开 OFD / PDF 文档',
      buttonLabel: '打开',
      properties: ['openFile'],
      filters: [
        { name: 'OFD / PDF 文档', extensions: ['ofd', 'pdf'] },
        { name: 'OFD 文档', extensions: ['ofd'] },
        { name: 'PDF 文档', extensions: ['pdf'] }
      ]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('file:reveal', (_event, rawPath: unknown) => {
    if (typeof rawPath === 'string' && rawPath.length > 0) {
      shell.showItemInFolder(rawPath)
    }
  })

  ipcMain.handle('app:versions', () => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  }))

  ipcMain.handle('app:open-external', async (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== 'string') return
    try {
      const url = new URL(rawUrl)
      if (url.protocol === 'https:') {
        await shell.openExternal(url.toString())
      }
    } catch {
      // 忽略非法链接
    }
  })
}

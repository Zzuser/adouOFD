import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { BackendManager } from './backend'
import { parseDocumentPaths } from './document-args'
import { readLegalNotices, revealLegalNotices } from './legal'
import { listPrinters, parsePrintOptions, printDocument } from './print'
import {
  installTextAssetProtocol,
  readTextFile,
  registerTextAssetScheme,
  writeTextFile
} from './text-files'
import { exportTextPdf } from './text-pdf'
import {
  addRecentFile,
  clearRecentFiles,
  listRecentFiles,
  removeRecentFile
} from './recent-files'
import {
  ensureRegisteredOnStartup,
  getWindowsIntegration,
  openDefaultAppChoice,
  registerFileAssociations,
  unregisterFileAssociations
} from './windows-integration'
import type { BackendInfo } from '../shared/types'

const APP_NAME = '阿豆OFD'
app.setName(APP_NAME)
const userDataOverride = process.env.ADOU_USER_DATA
app.setPath(
  'userData',
  userDataOverride ? resolve(userDataOverride) : join(app.getPath('appData'), 'adou-ofd')
)
app.setAppUserModelId('com.adou.ofd')
registerTextAssetScheme()

let mainWindow: BrowserWindow | null = null
let backend: BackendManager | null = null
let quitting = false
let unsavedTextCount = 0
let allowWindowClose = false
const pendingFiles: string[] = parseDocumentPaths(process.argv, process.cwd())

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const files = parseDocumentPaths(argv, workingDirectory)
    if (files.length > 0) {
      pendingFiles.push(...files)
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('app:open-files-available')
      }
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  backend = new BackendManager()
  backend.onChange((info: BackendInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:status', info)
    }
  })
  // 引擎与 Electron/窗口初始化并行启动，减少用户看到“启动中”的时间
  void backend.start()

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    installTextAssetProtocol()

    registerIpc()
    createWindow()
    void ensureRegisteredOnStartup()

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
    if (!allowWindowClose && unsavedTextCount > 0) {
      event.preventDefault()
      mainWindow?.show()
      mainWindow?.focus()
      if (!confirmDiscardChanges()) return
      allowWindowClose = true
    }
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

function confirmDiscardChanges(): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return true
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    title: '有未保存的修改',
    message: `还有 ${unsavedTextCount} 个文本文件未保存。`,
    detail: '退出会丢失这些修改。',
    buttons: ['取消', '不保存并退出'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  return choice === 1
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
  window.on('close', (event) => {
    if (allowWindowClose || unsavedTextCount === 0) return
    event.preventDefault()
    if (confirmDiscardChanges()) {
      allowWindowClose = true
      window.close()
    }
  })
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
      title: '打开文档',
      buttonLabel: '打开',
      properties: ['openFile'],
      filters: [
        { name: '支持的文件', extensions: ['ofd', 'pdf', 'md', 'markdown', 'txt'] },
        { name: 'OFD / PDF 文档', extensions: ['ofd', 'pdf'] },
        { name: 'Markdown / 文本', extensions: ['md', 'markdown', 'txt'] },
        { name: 'OFD 文档', extensions: ['ofd'] },
        { name: 'PDF 文档', extensions: ['pdf'] }
      ]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:new-text', async (_event, rawKind: unknown) => {
    const kind = rawKind === 'txt' ? 'txt' : 'md'
    const autoTarget = process.env.ADOU_TEST_NEW_TEXT
    let target = typeof autoTarget === 'string' ? autoTarget.trim() : ''
    if (!target) {
      const saveOptions: Electron.SaveDialogOptions = {
        title: kind === 'md' ? '新建 Markdown 文档' : '新建文本文档',
        buttonLabel: '创建',
        defaultPath: join(
          app.getPath('documents'),
          kind === 'md' ? '未命名.md' : '未命名.txt'
        ),
        filters: [
          {
            name: kind === 'md' ? 'Markdown 文档' : '文本文档',
            extensions: [kind]
          }
        ]
      }
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions)
      if (result.canceled || !result.filePath) return null
      target = result.filePath
    }
    const extension = `.${kind}`
    if (!target.toLowerCase().endsWith(extension)) target += extension
    try {
      writeFileSync(target, '', 'utf8')
      return resolve(target)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '无法创建文件')
    }
  })

  ipcMain.handle('dialog:open-documents', async () => {    // 自动化冒烟/压测：ADOU_TEST_OPEN_FILES 支持“分号分隔路径”或“路径清单 txt”
    const autoFiles = process.env.ADOU_TEST_OPEN_FILES
    if (autoFiles) {
      if (autoFiles.toLowerCase().endsWith('.txt') && existsSync(autoFiles)) {
        return readFileSync(autoFiles, 'utf8')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      }
      return autoFiles.split(';').map((item) => item.trim()).filter((item) => item.length > 0)
    }
    const options: Electron.OpenDialogOptions = {
      title: '选择 OFD / PDF 文档',
      buttonLabel: '添加',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'OFD / PDF 文档', extensions: ['ofd', 'pdf'] },
        { name: 'OFD 文档', extensions: ['ofd'] },
        { name: 'PDF 文档', extensions: ['pdf'] }
      ]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:pick-directory', async (_event, payload: unknown) => {
    const autoDir = process.env.ADOU_TEST_SPLIT_DIR ?? process.env.ADOU_TEST_OUTPUT_DIR
    if (autoDir) {
      return autoDir
    }
    const optionsPayload = payload as { title?: unknown } | null
    const title =
      typeof optionsPayload?.title === 'string' && optionsPayload.title.trim()
        ? optionsPayload.title.trim()
        : '选择转换结果保存目录'
    const options: Electron.OpenDialogOptions = {
      title,
      buttonLabel: '选择',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:save-conversion', async (_event, payload: unknown) => {
    // 自动化冒烟：显式设置环境变量时跳过原生保存对话框
    const autoSave = process.env.ADOU_TEST_SAVE_FILE
    if (autoSave) {
      return autoSave
    }
    const options = payload as { sourcePath?: unknown; target?: unknown } | null
    const rawSource = options?.sourcePath
    const rawTarget = options?.target
    const sourcePath = typeof rawSource === 'string' ? rawSource : ''
    const target = typeof rawTarget === 'string' ? rawTarget.toUpperCase() : ''
    if (target !== 'PDF' && target !== 'OFD') {
      return null
    }
    const extension = target.toLowerCase()
    const base = sourcePath ? basename(sourcePath).replace(/\.[^.]+$/, '') : '阿豆OFD-转换结果'
    const sourceDir = sourcePath ? dirname(sourcePath) : ''
    const preferredDir =
      sourceDir && !sourceDir.startsWith(tmpdir()) ? sourceDir : app.getPath('documents')
    const saveOptions: Electron.SaveDialogOptions = {
      title: `转换为 ${target} 并保存`,
      buttonLabel: '保存',
      defaultPath: join(preferredDir, `${base}.${extension}`),
      filters: [{ name: `${target} 文件`, extensions: [extension] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions)
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle('dialog:save-merge', async (_event, payload: unknown) => {
    // 自动化冒烟：显式设置环境变量时跳过原生保存对话框
    const autoSave = process.env.ADOU_TEST_MERGE_FILE
    if (autoSave) {
      return autoSave
    }
    const options = payload as { target?: unknown } | null
    const target = typeof options?.target === 'string' ? options.target.toUpperCase() : ''
    if (target !== 'PDF' && target !== 'OFD') {
      return null
    }
    const extension = target.toLowerCase()
    const saveOptions: Electron.SaveDialogOptions = {
      title: `合并为 ${target} 并保存`,
      buttonLabel: '保存',
      defaultPath: join(app.getPath('documents'), `合并文档.${extension}`),
      filters: [{ name: `${target} 文件`, extensions: [extension] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions)
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle('dialog:save-page-tool', async (_event, payload: unknown) => {
    // 自动化冒烟：显式设置环境变量时跳过原生保存对话框
    const autoSave = process.env.ADOU_TEST_INSERT_FILE
    if (autoSave) {
      return autoSave
    }
    const options = payload as { target?: unknown; defaultName?: unknown } | null
    const target = typeof options?.target === 'string' ? options.target.toUpperCase() : ''
    if (target !== 'PDF' && target !== 'OFD') {
      return null
    }
    const extension = target.toLowerCase()
    const rawName =
      typeof options?.defaultName === 'string' && options.defaultName.trim()
        ? basename(options.defaultName.trim()).replace(/\.[^.]+$/, '')
        : '插入页面'
    const saveOptions: Electron.SaveDialogOptions = {
      title: '插入页面并保存',
      buttonLabel: '保存',
      defaultPath: join(app.getPath('documents'), `${rawName}.${extension}`),
      filters: [{ name: `${target} 文件`, extensions: [extension] }]
    }
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions)
    return result.canceled || !result.filePath ? null : result.filePath
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

  ipcMain.handle('app:take-pending-files', () => pendingFiles.splice(0))

  ipcMain.handle('windows:integration', () => getWindowsIntegration())
  ipcMain.handle('windows:register', () => registerFileAssociations())
  ipcMain.handle('windows:unregister', () => unregisterFileAssociations())
  ipcMain.handle('windows:open-default-choice', () => openDefaultAppChoice())
  ipcMain.handle('windows:open-default-apps', async () => {
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:defaultapps')
    }
  })

  ipcMain.handle('legal:read', () => readLegalNotices())
  ipcMain.handle('legal:reveal', () => revealLegalNotices())

  ipcMain.handle('printer:list', () => listPrinters(mainWindow?.webContents))

  ipcMain.handle('recent:list', () => listRecentFiles())
  ipcMain.handle('recent:add', (_event, payload: unknown) => addRecentFile(payload))
  ipcMain.handle('recent:remove', (_event, rawPath: unknown) => removeRecentFile(rawPath))
  ipcMain.handle('recent:clear', () => clearRecentFiles())

  ipcMain.handle('text:read', (_event, rawPath: unknown) => readTextFile(rawPath))
  ipcMain.handle('text:write', (_event, payload: unknown) => writeTextFile(payload))
  ipcMain.handle('text:export-pdf', async (_event, payload: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: '窗口不可用' }
    }
    return exportTextPdf(mainWindow, payload)
  })
  ipcMain.on('text:unsaved-count', (_event, rawCount: unknown) => {
    unsavedTextCount =
      typeof rawCount === 'number' && Number.isFinite(rawCount)
        ? Math.max(0, Math.floor(rawCount))
        : 0
  })

  ipcMain.handle('document:print', async (_event, payload: unknown) => {
    if (!backend || backend.info.status !== 'ready' || !backend.info.port || !backend.info.token) {
      return { ok: false, error: '本地引擎尚未就绪，请稍候再试' }
    }
    const options = parsePrintOptions(payload)
    if (!options) {
      return { ok: false, error: '打印参数无效' }
    }
    return printDocument(backend.info, options)
  })
}

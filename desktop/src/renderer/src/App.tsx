import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppVersions,
  BackendInfo,
  DocumentSummary,
  EngineHealth,
  RecentFile,
  RecentFileInput,
  ThemePreference
} from '@shared/types'
import type { TextKind } from '@shared/text-paths'
import { fileNameOf, isTextPath, textKindOf } from '@shared/text-paths'
import type { RotationMap } from '@shared/rotation'
import { closeDocument, fetchHealth, messageOf, openDocument, ApiRequestError } from './api'
import { AboutDialog } from './components/AboutDialog'
import { BatchConvert } from './components/BatchConvert'
import { ConvertDialog } from './components/ConvertDialog'
import { DocTabs } from './components/DocTabs'
import { EngineBadge } from './components/EngineBadge'
import { EmptyState } from './components/EmptyState'
import { MergePage } from './components/MergePage'
import { PageToolsPage } from './components/PageToolsPage'
import { PasswordDialog } from './components/PasswordDialog'
import { PrintDialog } from './components/PrintDialog'
import { Sidebar, type AppView } from './components/Sidebar'
import { SettingsPage } from './components/SettingsPage'
import { TextViewer, type TextViewerHandle } from './components/TextViewer'
import { Viewer } from './components/Viewer'
import { IconAlert } from './components/icons'
import {
  applyResolvedTheme,
  applyThemePreference,
  readThemePreference,
  watchSystemTheme,
  writeThemePreference
} from './theme'

const INITIAL_BACKEND: BackendInfo = { status: 'starting', port: null, token: null }
const MAX_TABS = 8

interface DocumentTab {
  type: 'document'
  key: string
  doc: DocumentSummary
}

interface TextTab {
  type: 'text'
  key: string
  path: string
  name: string
  kind: TextKind
}

type Tab = DocumentTab | TextTab

interface PrintTarget {
  doc: DocumentSummary
  page: number
  rotations: RotationMap
  transient: boolean
}

interface PasswordTarget {
  path: string
  name: string
  message: string
  invalid: boolean
}

export default function App() {
  const [backend, setBackend] = useState<BackendInfo>(INITIAL_BACKEND)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [versions, setVersions] = useState<AppVersions | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dirtyTexts, setDirtyTexts] = useState<Record<string, boolean>>({})
  const [closeTarget, setCloseTarget] = useState<string | null>(null)
  const [closeSaving, setCloseSaving] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutAutoCheck, setAboutAutoCheck] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [view, setView] = useState<AppView>('viewer')
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<PasswordTarget | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [printNotice, setPrintNotice] = useState<{ kind: 'preparing' | 'error'; message: string } | null>(null)
  const preparingPrintRef = useRef(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('adou.sidebar.collapsed') === '1'
    } catch {
      return false
    }
  })
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readThemePreference()
  )

  const tabsRef = useRef<Tab[]>([])
  const activeIdRef = useRef<string | null>(null)
  const dirtyTextsRef = useRef<Record<string, boolean>>({})
  const textHandlesRef = useRef(new Map<string, TextViewerHandle>())
  const deferredFilesRef = useRef<string[]>([])
  const activeTab = tabs.find((tab) => tab.key === activeId) ?? null
  const doc = activeTab?.type === 'document' ? activeTab.doc : null
  const closeTabItem = closeTarget ? tabs.find((tab) => tab.key === closeTarget) ?? null : null
  const closeTabName = closeTabItem
    ? closeTabItem.type === 'document'
      ? closeTabItem.doc.name
      : closeTabItem.name
    : ''
  const ready = backend.status === 'ready'

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    dirtyTextsRef.current = dirtyTexts
  }, [dirtyTexts])

  useEffect(() => {
    const count = Object.values(dirtyTexts).filter(Boolean).length
    window.adou.setUnsavedTextCount(count)
  }, [dirtyTexts])

  useEffect(() => {
    writeThemePreference(themePreference)
    window.adou.setThemeSource(themePreference)
    applyThemePreference(themePreference)
    if (themePreference !== 'system') return
    return watchSystemTheme(applyResolvedTheme)
  }, [themePreference])

  useEffect(() => {
    let alive = true
    void window.adou.getBackendInfo().then((info) => {
      if (alive && info) setBackend(info)
    })
    void window.adou.getVersions().then((value) => {
      if (alive) setVersions(value)
    })
    const unsubscribe = window.adou.onBackendStatus((info) => setBackend(info))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let alive = true
    void window.adou
      .listRecentFiles()
      .then((list) => {
        if (alive) setRecentFiles(list)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (backend.status !== 'ready') {
      setHealth(null)
      return
    }
    let alive = true
    void fetchHealth(backend)
      .then((value) => {
        if (alive) setHealth(value)
      })
      .catch((reason: unknown) => {
        if (alive) setError(messageOf(reason))
      })
    return () => {
      alive = false
    }
  }, [backend])

  useEffect(() => {
    if (backend.status === 'error' && backend.message) {
      setError(backend.message)
    }
  }, [backend.status, backend.message])

  useEffect(() => {
    if (printNotice?.kind !== 'error') return
    const timer = window.setTimeout(() => setPrintNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [printNotice])

  const recordRecent = useCallback((entry: RecentFileInput) => {
    void window.adou
      .addRecentFile(entry)
      .then(setRecentFiles)
      .catch(() => undefined)
  }, [])

  const showDocument = useCallback(
    (summary: DocumentSummary) => {
      if (!summary.demo) {
        recordRecent({
          path: summary.path,
          name: summary.name,
          kind: summary.kind === 'PDF' ? 'PDF' : 'OFD',
          pageCount: summary.pageCount
        })
      }
      const current = tabsRef.current
      const existing = current.find(
        (tab) =>
          tab.type === 'document' &&
          (tab.doc.id === summary.id ||
            (!summary.demo && tab.doc.path.toLowerCase() === summary.path.toLowerCase()))
      )
      if (existing) {
        activeIdRef.current = existing.key
        setActiveId(existing.key)
        setView('viewer')
        return
      }
      if (current.length >= MAX_TABS) {
        void closeDocument(backend, summary.id).catch(() => undefined)
        setError(`最多同时打开 ${MAX_TABS} 个文档，请先关闭标签`)
        return
      }
      const next: Tab[] = [...current, { type: 'document', key: summary.id, doc: summary }]
      tabsRef.current = next
      setTabs(next)
      activeIdRef.current = summary.id
      setActiveId(summary.id)
      setView('viewer')
    },
    [backend, recordRecent]
  )

  const openTextFile = useCallback(
    (path: string) => {
      const kind = textKindOf(path)
      if (!kind) return false
      const existing = tabsRef.current.find(
        (tab): tab is TextTab =>
          tab.type === 'text' && tab.path.toLowerCase() === path.toLowerCase()
      )
      if (existing) {
        activeIdRef.current = existing.key
        setActiveId(existing.key)
        setView('viewer')
        setError(null)
        recordRecent({ path, name: existing.name, kind, pageCount: 0 })
        return true
      }
      if (tabsRef.current.length >= MAX_TABS) {
        setError(`最多同时打开 ${MAX_TABS} 个标签，请先关闭标签`)
        return true
      }
      const key = `text:${path.toLowerCase()}`
      const tab: TextTab = { type: 'text', key, path, name: fileNameOf(path), kind }
      const next = [...tabsRef.current, tab]
      tabsRef.current = next
      setTabs(next)
      activeIdRef.current = key
      setActiveId(key)
      setView('viewer')
      setError(null)
      recordRecent({ path, name: tab.name, kind, pageCount: 0 })
      return true
    },
    [recordRecent]
  )

  const createText = useCallback(
    async (kind: 'md' | 'txt') => {
      try {
        const path = await window.adou.createTextFile(kind)
        if (path) openTextFile(path)
      } catch (reason) {
        setError(messageOf(reason))
      }
    },
    [openTextFile]
  )

  const openPath = useCallback(
    async (path: string, password?: string) => {      if (isTextPath(path)) {
        openTextFile(path)
        return
      }
      if (!ready) {
        setError('本地引擎尚未就绪，请稍候再试')
        return
      }
      const existing = tabsRef.current.find(
        (tab) => tab.type === 'document' && tab.doc.path.toLowerCase() === path.toLowerCase()
      )
      if (existing) {
        activeIdRef.current = existing.key
        setActiveId(existing.key)
        setView('viewer')
        setError(null)
        setPasswordTarget(null)
        if (existing.type === 'document') recordRecent({
          path: existing.doc.path,
          name: existing.doc.name,
          kind: existing.doc.kind === 'PDF' ? 'PDF' : 'OFD',
          pageCount: existing.doc.pageCount
        })
        return
      }
      if (tabsRef.current.length >= MAX_TABS) {
        setPasswordTarget(null)
        setError(`最多同时打开 ${MAX_TABS} 个文档，请先关闭标签`)
        return
      }
      setBusy(true)
      setError(null)
      try {
        const summary = await openDocument(backend, path, password)
        setPasswordTarget(null)
        showDocument(summary)
      } catch (reason) {
        if (
          reason instanceof ApiRequestError &&
          (reason.code === 'PDF_PASSWORD_REQUIRED' || reason.code === 'PDF_PASSWORD_INVALID')
        ) {
          setPasswordTarget({
            path,
            name: path.split(/[\\/]/).pop() || path,
            message: reason.message,
            invalid: reason.code === 'PDF_PASSWORD_INVALID'
          })
        } else {
          setPasswordTarget(null)
          setError(messageOf(reason))
        }
      } finally {
        setBusy(false)
      }
    },
    [backend, ready, showDocument, recordRecent, openTextFile]
  )

  const openQueuedFiles = useCallback(async () => {
    const paths = await window.adou.takePendingFiles()
    const deferred: string[] = []
    for (const path of paths) {
      if (isTextPath(path) || ready) await openPath(path)
      else deferred.push(path)
    }
    if (deferred.length > 0) deferredFilesRef.current.push(...deferred)
    if (ready) {
      const waiting = deferredFilesRef.current.splice(0)
      for (const path of waiting) await openPath(path)
    }
  }, [openPath, ready])

  const submitPassword = useCallback(
    async (password: string) => {
      const target = passwordTarget
      if (!target) return
      setPasswordBusy(true)
      try {
        await openPath(target.path, password)
      } finally {
        setPasswordBusy(false)
      }
    },
    [openPath, passwordTarget]
  )

  const cancelPassword = useCallback(() => {
    setPasswordTarget(null)
    setPasswordBusy(false)
  }, [])

  useEffect(() => {
    return window.adou.onOpenFiles(() => {
      void openQueuedFiles()
    })
  }, [openQueuedFiles])

  useEffect(() => {
    void openQueuedFiles()
  }, [openQueuedFiles])

  const pickDocument = useCallback(async () => {
    const path = await window.adou.pickDocument()
    if (path) await openPath(path)
  }, [openPath])
  const dropFiles = useCallback(
    (files: FileList) => {
      const file = files[0]
      if (!file) return
      const path = window.adou.getPathForFile(file)
      if (!path) {
        setError('无法读取拖入文件的路径，请使用“打开文档”按钮')
        return
      }
      if (!/\.(ofd|pdf|md|markdown|txt)$/i.test(path)) {
        setError('当前支持打开 .ofd / .pdf / .md / .markdown / .txt 文件')
        return
      }
      void openPath(path)
    },
    [openPath]
  )

  const openRecent = useCallback(
    async (entry: RecentFile) => {
      await openPath(entry.path)
      const list = await window.adou.listRecentFiles().catch(() => null)
      if (list) setRecentFiles(list)
    },
    [openPath]
  )

  const removeRecent = useCallback(async (path: string) => {
    const list = await window.adou.removeRecentFile(path).catch(() => null)
    if (list) setRecentFiles(list)
  }, [])

  const clearRecent = useCallback(async (): Promise<boolean> => {
    try {
      await window.adou.clearRecentFiles()
      setRecentFiles([])
      return true
    } catch {
      // 最近文件清空失败不阻塞主流程
      return false
    }
  }, [])

  const revealRecent = useCallback((path: string) => {
    void window.adou.revealPath(path)
  }, [])

  const finalizeClose = useCallback(
    (id: string) => {
      const current = tabsRef.current
      const index = current.findIndex((tab) => tab.key === id)
      if (index < 0) return
      const closing = current[index]
      const next = current.filter((tab) => tab.key !== id)
      tabsRef.current = next
      setTabs(next)
      setDirtyTexts((previous) => {
        if (!(id in previous)) return previous
        const copy = { ...previous }
        delete copy[id]
        return copy
      })
      textHandlesRef.current.delete(id)
      if (activeIdRef.current === id) {
        const neighbor = next[Math.min(index, next.length - 1)] ?? null
        activeIdRef.current = neighbor?.key ?? null
        setActiveId(neighbor?.key ?? null)
        setConvertOpen(false)
      }
      if (closing.type === 'document' && backend.status === 'ready') {
        void closeDocument(backend, closing.doc.id).catch(() => undefined)
      }
    },
    [backend]
  )

  const requestCloseTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((item) => item.key === id)
      if (tab?.type === 'text') {
        const handle = textHandlesRef.current.get(id)
        const dirty = handle ? handle.isDirty() : dirtyTextsRef.current[id]
        if (dirty) {
          setCloseTarget(id)
          return
        }
      }
      finalizeClose(id)
    },
    [finalizeClose]
  )

  const saveAndClose = useCallback(async () => {
    const target = closeTarget
    if (!target) return
    const handle = textHandlesRef.current.get(target)
    setCloseSaving(true)
    let saved = true
    try {
      saved = handle ? await handle.save() : true
    } finally {
      setCloseSaving(false)
    }
    setCloseTarget(null)
    if (saved) finalizeClose(target)
  }, [closeTarget, finalizeClose])

  const setTextDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyTexts((previous) =>
      previous[key] === dirty ? previous : { ...previous, [key]: dirty }
    )
  }, [])

  const registerTextHandle = useCallback(
    (key: string, handle: TextViewerHandle | null) => {
      if (handle) textHandlesRef.current.set(key, handle)
      else textHandlesRef.current.delete(key)
    },
    []
  )

  const switchTab = useCallback((id: string) => {
    if (activeIdRef.current === id) return
    activeIdRef.current = id
    setActiveId(id)
    setConvertOpen(false)
    setView('viewer')
  }, [])

  const retryEngine = useCallback(async () => {
    setError(null)
    try {
      const info = await window.adou.restartBackend()
      if (info) setBackend(info)
    } catch (reason) {
      setError(messageOf(reason))
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem('adou.sidebar.collapsed', next ? '1' : '0')
      } catch {
        // 本地存储不可用时仅保持当前会话状态
      }
      return next
    })
  }, [])

  const requestPrint = useCallback(
    (targetDoc: DocumentSummary, page: number, rotations: RotationMap = {}) => {
      setPrintTarget({ doc: targetDoc, page, rotations, transient: false })
    },
    []
  )

  const closePrintTarget = useCallback(() => {
    const target = printTarget
    setPrintTarget(null)
    if (target?.transient && backend.status === 'ready') {
      void closeDocument(backend, target.doc.id).catch(() => undefined)
    }
  }, [backend, printTarget])

  const printResultFile = useCallback(
    async (path: string) => {
      if (!ready) {
        setPrintNotice({ kind: 'error', message: '本地引擎尚未就绪，请稍候再试' })
        return
      }
      if (preparingPrintRef.current) return
      const existing = tabsRef.current.find(
        (tab) => tab.type === 'document' && tab.doc.path.toLowerCase() === path.toLowerCase()
      )
      if (existing && existing.type === 'document') {
        setPrintTarget({ doc: existing.doc, page: 1, rotations: {}, transient: false })
        return
      }
      if (tabsRef.current.length >= MAX_TABS) {
        setPrintNotice({
          kind: 'error',
          message: `最多同时打开 ${MAX_TABS} 个文档，请先关闭标签后再打印结果`
        })
        return
      }
      preparingPrintRef.current = true
      setPrintNotice({ kind: 'preparing', message: '正在准备打印…' })
      try {
        const summary = await openDocument(backend, path)
        setPrintNotice(null)
        setPrintTarget({ doc: summary, page: 1, rotations: {}, transient: true })
      } catch (reason) {
        setPrintNotice({ kind: 'error', message: messageOf(reason) })
      } finally {
        preparingPrintRef.current = false
      }
    },
    [backend, ready]
  )

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        backend={backend}
        collapsed={sidebarCollapsed}
        view={view}
        onNavigate={setView}
        onToggle={toggleSidebar}
        appVersion={versions?.app}
        onAbout={() => setAboutOpen(true)}
        onRetry={() => void retryEngine()}
      />

      <main className="main" data-view={view}>
        <header className={`topbar ${view === 'viewer' && tabs.length > 0 ? 'viewer-topbar' : ''}`}>
          {view === 'viewer' && tabs.length > 0 ? (
            <>
              <DocTabs
                tabs={tabs.map((tab) => ({
                  id: tab.key,
                  name: tab.type === 'document' ? tab.doc.name : tab.name,
                  kind: tab.type === 'document' ? tab.doc.kind : tab.kind,
                  path: tab.type === 'document' ? tab.doc.path : tab.path,
                  dirty: tab.type === 'text' && Boolean(dirtyTexts[tab.key])
                }))}
                activeId={activeId}
                onSelect={switchTab}
                onClose={requestCloseTab}
                onOpen={() => void pickDocument()}
              />
              {backend.status !== 'ready' ? (
                <div className="topbar-actions">
                  <EngineBadge backend={backend} onRetry={() => void retryEngine()} />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="topbar-title">
                <h1>
                  {view === 'batch'
                    ? '批量转换'
                    : view === 'merge'
                      ? '合并文档'
                      : view === 'pages'
                        ? '拆分与插页'
                        : view === 'settings'
                          ? '设置'
                          : '文档查看'}
                </h1>
                <span className="topbar-hint">
                  {view === 'batch'
                    ? '一次加入多个文件，逐个转换到另一种格式；文件只在本机处理。'
                    : view === 'merge'
                      ? '按列表顺序把多个 OFD / PDF 合并为一个文档；文件只在本机处理。'
                      : view === 'pages'
                        ? '按页或区间拆分文档，也可把另一个文档的页面插入到指定位置；文件只在本机处理。'
                        : view === 'settings'
                          ? '外观、文件关联、本地数据与版本更新。'
                          : '阅读与编辑本地 OFD / PDF / Markdown / 文本文档。'}
                </span>
              </div>
              {backend.status !== 'ready' ? (
                <div className="topbar-actions">
                  <EngineBadge backend={backend} onRetry={() => void retryEngine()} />
                </div>
              ) : null}
            </>
          )}
        </header>

        {error ? (
          <div className="alert" role="alert">
            <IconAlert size={18} />
            <div className="alert-text">{error}</div>
            <button
              className="alert-close"
              aria-label="关闭提示"
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        <section className={`content ${view === 'viewer' && tabs.length > 0 ? 'has-doc' : ''}`}>
          <div className="pane" hidden={view !== 'batch'}>
            <BatchConvert
              backend={backend}
              onOpenDocument={(path) => {
                setView('viewer')
                void openPath(path)
              }}
              onPrintResult={(path) => void printResultFile(path)}
            />
          </div>

          <div className="pane" hidden={view !== 'merge'}>
            <MergePage
              backend={backend}
              onOpenDocument={(path) => {
                setView('viewer')
                void openPath(path)
              }}
              onPrintResult={(path) => void printResultFile(path)}
            />
          </div>

          <div className="pane" hidden={view !== 'pages'}>
            <PageToolsPage
              backend={backend}
              onOpenDocument={(path) => {
                setView('viewer')
                void openPath(path)
              }}
              onPrintResult={(path) => void printResultFile(path)}
            />
          </div>

          <div className="pane" hidden={view !== 'settings'}>
            <SettingsPage
              active={view === 'settings'}
              themePreference={themePreference}
              onThemeChange={setThemePreference}
              recentCount={recentFiles.length}
              onClearRecent={clearRecent}
              onCheckUpdate={() => {
                setAboutAutoCheck(true)
                setAboutOpen(true)
              }}
            />
          </div>

          <div className="pane viewer-stack" hidden={view !== 'viewer'}>
            {tabs.length === 0 ? (
              <EmptyState
                ready={ready}
                busy={busy}
                engineStarting={backend.status === 'starting'}
                onOpen={() => void pickDocument()}
                onNewMarkdown={() => void createText('md')}
                onNewText={() => void createText('txt')}
                onDropFiles={dropFiles}
                recentFiles={recentFiles}
                onOpenRecent={(entry) => void openRecent(entry)}
                onRevealRecent={revealRecent}
                onRemoveRecent={(path) => void removeRecent(path)}
                onClearRecent={() => void clearRecent()}
              />
            ) : (
              tabs.map((tab) => (
                <div
                  className="pane viewer-pane"
                  hidden={tab.key !== activeId}
                  key={tab.key}
                >
                  {tab.type === 'document' ? (
                    <Viewer
                      backend={backend}
                      doc={tab.doc}
                      active={tab.key === activeId && view === 'viewer'}
                      printOpen={Boolean(printTarget)}
                      onClose={() => requestCloseTab(tab.key)}
                      onConvert={() => setConvertOpen(true)}
                      onPrint={(page, rotations) => requestPrint(tab.doc, page, rotations)}
                    />
                  ) : (
                    <TextViewer
                      ref={(handle) => registerTextHandle(tab.key, handle)}
                      path={tab.path}
                      active={tab.key === activeId && view === 'viewer'}
                      onDirtyChange={(dirty) => setTextDirty(tab.key, dirty)}
                      onOpenPath={(path) => void openPath(path)}
                      onClose={() => requestCloseTab(tab.key)}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <AboutDialog
        open={aboutOpen}
        autoCheck={aboutAutoCheck}
        onClose={() => {
          setAboutOpen(false)
          setAboutAutoCheck(false)
        }}
        backend={backend}
        health={health}
        versions={versions}
      />

      {doc ? (
        <ConvertDialog
          open={convertOpen}
          backend={backend}
          doc={doc}
          onClose={() => setConvertOpen(false)}
          onOpenOutput={(path) => {
            setConvertOpen(false)
            void openPath(path)
          }}
          onPrintOutput={(path) => void printResultFile(path)}
        />
      ) : null}

      {printTarget ? (
        <PrintDialog
          open
          backend={backend}
          doc={printTarget.doc}
          currentPage={printTarget.page}
          rotations={printTarget.rotations}
          onClose={closePrintTarget}
        />
      ) : null}

      <PasswordDialog
        open={Boolean(passwordTarget)}
        fileName={passwordTarget?.name ?? ''}
        message={passwordTarget?.message ?? ''}
        invalid={passwordTarget?.invalid ?? false}
        busy={passwordBusy}
        onSubmit={(password) => void submitPassword(password)}
        onCancel={cancelPassword}
      />

      {closeTabItem ? (
        <div className="text-close-backdrop" role="dialog" aria-modal="true">
          <div className="text-close-dialog">
            <h3>保存修改？</h3>
            <p>
              “{closeTabName}”还有未保存的修改。关闭后这些修改会丢失。
            </p>
            <div className="text-close-actions">
              <button
                type="button"
                className="btn ghost small"
                disabled={closeSaving}
                onClick={() => setCloseTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn ghost small danger-text"
                data-action="text-close-discard"
                disabled={closeSaving}
                onClick={() => {
                  const target = closeTarget
                  setCloseTarget(null)
                  if (target) finalizeClose(target)
                }}
              >
                不保存关闭
              </button>
              <button
                type="button"
                className="btn primary small"
                data-action="text-close-save"
                disabled={closeSaving}
                onClick={() => void saveAndClose()}
              >
                {closeSaving ? '保存中…' : '保存并关闭'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printNotice ? (
        <div
          className={`print-notice ${printNotice.kind === 'error' ? 'error' : ''}`}
          role={printNotice.kind === 'error' ? 'alert' : 'status'}
        >
          {printNotice.kind === 'error' ? (
            <IconAlert size={15} />
          ) : (
            <span className="print-notice-spinner" />
          )}
          <span>{printNotice.message}</span>
        </div>
      ) : null}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppVersions, BackendInfo, DocumentSummary, EngineHealth } from '@shared/types'
import { closeDocument, fetchHealth, messageOf, openDemo, openDocument, openPdfDemo } from './api'
import { AboutDialog } from './components/AboutDialog'
import { BatchConvert } from './components/BatchConvert'
import { ConvertDialog } from './components/ConvertDialog'
import { DocTabs } from './components/DocTabs'
import { EngineBadge } from './components/EngineBadge'
import { EmptyState } from './components/EmptyState'
import { MergePage } from './components/MergePage'
import { Sidebar, type AppView } from './components/Sidebar'
import { SettingsPage } from './components/SettingsPage'
import { Viewer } from './components/Viewer'
import { IconAlert } from './components/icons'

const INITIAL_BACKEND: BackendInfo = { status: 'starting', port: null, token: null }
const MAX_TABS = 8

interface ViewerTab {
  key: string
  doc: DocumentSummary
}

export default function App() {
  const [backend, setBackend] = useState<BackendInfo>(INITIAL_BACKEND)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [versions, setVersions] = useState<AppVersions | null>(null)
  const [tabs, setTabs] = useState<ViewerTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [view, setView] = useState<AppView>('viewer')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('adou.sidebar.collapsed') === '1'
    } catch {
      return false
    }
  })

  const tabsRef = useRef<ViewerTab[]>([])
  const activeIdRef = useRef<string | null>(null)
  const activeTab = tabs.find((tab) => tab.key === activeId) ?? null
  const doc = activeTab?.doc ?? null
  const ready = backend.status === 'ready'

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

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

  const showDocument = useCallback(
    (summary: DocumentSummary) => {
      const current = tabsRef.current
      const existing = current.find(
        (tab) =>
          tab.doc.id === summary.id ||
          (!summary.demo && tab.doc.path.toLowerCase() === summary.path.toLowerCase())
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
      const next = [...current, { key: summary.id, doc: summary }]
      tabsRef.current = next
      setTabs(next)
      activeIdRef.current = summary.id
      setActiveId(summary.id)
      setView('viewer')
    },
    [backend]
  )

  const openPath = useCallback(
    async (path: string) => {
      if (!ready) {
        setError('本地引擎尚未就绪，请稍候再试')
        return
      }
      const existing = tabsRef.current.find(
        (tab) => tab.doc.path.toLowerCase() === path.toLowerCase()
      )
      if (existing) {
        activeIdRef.current = existing.key
        setActiveId(existing.key)
        setView('viewer')
        setError(null)
        return
      }
      if (tabsRef.current.length >= MAX_TABS) {
        setError(`最多同时打开 ${MAX_TABS} 个文档，请先关闭标签`)
        return
      }
      setBusy(true)
      setError(null)
      try {
        showDocument(await openDocument(backend, path))
      } catch (reason) {
        setError(messageOf(reason))
      } finally {
        setBusy(false)
      }
    },
    [backend, ready, showDocument]
  )

  const openQueuedFiles = useCallback(async () => {
    if (!ready) return
    const paths = await window.adou.takePendingFiles()
    for (const path of paths) {
      await openPath(path)
    }
  }, [openPath, ready])

  useEffect(() => {
    return window.adou.onOpenFiles(() => {
      void openQueuedFiles()
    })
  }, [openQueuedFiles])

  useEffect(() => {
    if (ready) void openQueuedFiles()
  }, [ready, openQueuedFiles])

  const pickDocument = useCallback(async () => {
    if (!ready) {
      setError('本地引擎尚未就绪，请稍候再试')
      return
    }
    const path = await window.adou.pickDocument()
    if (path) await openPath(path)
  }, [openPath, ready])
  const openSample = useCallback(async () => {
    if (!ready) {
      setError('本地引擎尚未就绪，请稍候再试')
      return
    }
    const existing = tabsRef.current.find((tab) => tab.doc.demo && tab.doc.kind === 'OFD')
    if (existing) {
      activeIdRef.current = existing.key
      setActiveId(existing.key)
      setView('viewer')
      return
    }
    if (tabsRef.current.length >= MAX_TABS) {
      setError(`最多同时打开 ${MAX_TABS} 个文档，请先关闭标签`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      showDocument(await openDemo(backend))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }, [backend, ready, showDocument])

  const openPdfSample = useCallback(async () => {
    if (!ready) {
      setError('本地引擎尚未就绪，请稍候再试')
      return
    }
    const existing = tabsRef.current.find((tab) => tab.doc.demo && tab.doc.kind === 'PDF')
    if (existing) {
      activeIdRef.current = existing.key
      setActiveId(existing.key)
      setView('viewer')
      return
    }
    if (tabsRef.current.length >= MAX_TABS) {
      setError(`最多同时打开 ${MAX_TABS} 个文档，请先关闭标签`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      showDocument(await openPdfDemo(backend))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }, [backend, ready, showDocument])

  const dropFiles = useCallback(
    (files: FileList) => {
      const file = files[0]
      if (!file) return
      const path = window.adou.getPathForFile(file)
      if (!path) {
        setError('无法读取拖入文件的路径，请使用“打开文档”按钮')
        return
      }
      if (!/\.(ofd|pdf)$/i.test(path)) {
        setError('当前支持打开 .ofd 与 .pdf 文件')
        return
      }
      void openPath(path)
    },
    [openPath]
  )

  const closeTab = useCallback(
    (id: string) => {
      const current = tabsRef.current
      const index = current.findIndex((tab) => tab.key === id)
      if (index < 0) return
      const closing = current[index]
      const next = current.filter((tab) => tab.key !== id)
      tabsRef.current = next
      setTabs(next)
      if (activeIdRef.current === id) {
        const neighbor = next[Math.min(index, next.length - 1)] ?? null
        activeIdRef.current = neighbor?.key ?? null
        setActiveId(neighbor?.key ?? null)
        setConvertOpen(false)
      }
      if (backend.status === 'ready') {
        void closeDocument(backend, closing.doc.id).catch(() => undefined)
      }
    },
    [backend]
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
                  name: tab.doc.name,
                  kind: tab.doc.kind,
                  path: tab.doc.path
                }))}
                activeId={activeId}
                onSelect={switchTab}
                onClose={closeTab}
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
                      : view === 'settings'
                        ? '设置'
                        : '文档查看'}
                </h1>
                <span className="topbar-hint">
                  {view === 'batch'
                    ? '一次加入多个文件，逐个转换到另一种格式；文件只在本机处理。'
                    : view === 'merge'
                      ? '按列表顺序把多个 OFD / PDF 合并为一个文档；文件只在本机处理。'
                      : view === 'settings'
                        ? 'Windows 文件关联、默认应用与本地数据说明。'
                        : '打开并阅读本地 OFD / PDF 文档。'}
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

        <section className={`content ${view === 'viewer' && doc ? 'has-doc' : ''}`}>
          <div className="pane" hidden={view !== 'batch'}>
            <BatchConvert
              backend={backend}
              onOpenDocument={(path) => {
                setView('viewer')
                void openPath(path)
              }}
            />
          </div>

          <div className="pane" hidden={view !== 'merge'}>
            <MergePage
              backend={backend}
              onOpenDocument={(path) => {
                setView('viewer')
                void openPath(path)
              }}
            />
          </div>

          <div className="pane" hidden={view !== 'settings'}>
            <SettingsPage />
          </div>

          <div className="pane viewer-stack" hidden={view !== 'viewer'}>
            {tabs.length === 0 ? (
              <EmptyState
                ready={ready}
                busy={busy}
                engineStarting={backend.status === 'starting'}
                onOpen={() => void pickDocument()}
                onDemo={() => void openSample()}
                onPdfDemo={() => void openPdfSample()}
                onDropFiles={dropFiles}
              />
            ) : (
              tabs.map((tab) => (
                <div
                  className="pane viewer-pane"
                  hidden={tab.key !== activeId}
                  key={tab.key}
                >
                  <Viewer
                    backend={backend}
                    doc={tab.doc}
                    active={tab.key === activeId && view === 'viewer'}
                    onClose={() => closeTab(tab.key)}
                    onConvert={() => setConvertOpen(true)}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
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
        />
      ) : null}
    </div>
  )
}

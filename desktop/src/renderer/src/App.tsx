import { useCallback, useEffect, useState } from 'react'
import type { AppVersions, BackendInfo, DocumentSummary, EngineHealth } from '@shared/types'
import { closeDocument, fetchHealth, messageOf, openDemo, openDocument, openPdfDemo } from './api'
import { AboutDialog } from './components/AboutDialog'
import { EngineBadge } from './components/EngineBadge'
import { EmptyState } from './components/EmptyState'
import { Sidebar } from './components/Sidebar'
import { Viewer } from './components/Viewer'
import { IconAlert, IconFolder } from './components/icons'

const INITIAL_BACKEND: BackendInfo = { status: 'starting', port: null, token: null }

export default function App() {
  const [backend, setBackend] = useState<BackendInfo>(INITIAL_BACKEND)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [versions, setVersions] = useState<AppVersions | null>(null)
  const [doc, setDoc] = useState<DocumentSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('adou.sidebar.collapsed') === '1'
    } catch {
      return false
    }
  })

  const ready = backend.status === 'ready'

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
      if (doc) {
        void closeDocument(backend, doc.id).catch(() => undefined)
      }
      setDoc(summary)
    },
    [backend, doc]
  )

  const openPath = useCallback(
    async (path: string) => {
      if (!ready) {
        setError('本地引擎尚未就绪，请稍候再试')
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

  const closeCurrent = useCallback(() => {
    const current = doc
    setDoc(null)
    if (current && backend.status === 'ready') {
      void closeDocument(backend, current.id).catch(() => undefined)
    }
  }, [backend, doc])

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
        onToggle={toggleSidebar}
        appVersion={versions?.app}
        onAbout={() => setAboutOpen(true)}
        onRetry={() => void retryEngine()}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>文档查看</h1>
            <p className="subtitle" title={doc?.path}>
              {doc
                ? doc.demo
                  ? '内置示例文档 · 由本地引擎动态生成'
                  : doc.path
                : '打开并阅读本地 OFD / PDF 文档。'}
            </p>
          </div>
          <div className="topbar-actions">
            {doc ? (
              <button
                className="btn ghost small"
                onClick={() => void pickDocument()}
                disabled={!ready || busy}
              >
                <IconFolder size={15} />
                打开其他文档
              </button>
            ) : null}
            {backend.status !== 'ready' ? (
              <EngineBadge backend={backend} onRetry={() => void retryEngine()} />
            ) : null}
          </div>
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

        <section className={`content ${doc ? 'has-doc' : ''}`}>
          {doc ? (
            <Viewer backend={backend} doc={doc} onClose={closeCurrent} />
          ) : (
            <EmptyState
              ready={ready}
              busy={busy}
              engineStarting={backend.status === 'starting'}
              onOpen={() => void pickDocument()}
              onDemo={() => void openSample()}
              onPdfDemo={() => void openPdfSample()}
              onDropFiles={dropFiles}
            />
          )}
        </section>
      </main>

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        backend={backend}
        health={health}
        versions={versions}
      />
    </div>
  )
}

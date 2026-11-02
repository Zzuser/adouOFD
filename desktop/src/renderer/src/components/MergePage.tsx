import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackendInfo, MergeJob } from '@shared/types'
import { cancelMerge, fetchMerge, messageOf, probeFiles, startMerge } from '../api'
import {
  IconAlert,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconFile,
  IconFolder,
  IconInfo,
  IconLocation,
  IconMerge,
  IconPrint,
  IconSpark,
  IconView
} from './icons'

const POLL_INTERVAL = 350
const STALL_TIMEOUT_MS = 180_000
const MAX_POLL_FAILURES = 5
const MAX_FILES = 100
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])

type MergeTarget = 'OFD' | 'PDF'
type ItemStatus = 'probing' | 'ready' | 'invalid'

interface MergeItem {
  key: string
  path: string
  name: string
  size: number
  kind: string
  pages: number
  status: ItemStatus
  error: string | null
}

interface MergePageProps {
  backend: BackendInfo
  onOpenDocument: (path: string) => void
  onPrintResult: (path: string) => void
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index >= 0 ? path.slice(index + 1) : path
}

function createKey(path: string): string {
  return `${path}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function MergePage({ backend, onOpenDocument, onPrintResult }: MergePageProps) {
  const [items, setItems] = useState<MergeItem[]>([])
  const [target, setTarget] = useState<MergeTarget>('OFD')
  const [outputPath, setOutputPath] = useState('')
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [job, setJob] = useState<MergeJob | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const itemsRef = useRef<MergeItem[]>([])
  const runningRef = useRef(false)
  const stopRef = useRef(false)
  const dragIndexRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const addPaths = useCallback(
    async (paths: string[]) => {
      const accepted = paths.filter((path) => /\.(ofd|pdf)$/i.test(path))
      if (accepted.length === 0) {
        setError('仅支持 .ofd 与 .pdf 文件')
        return
      }
      const existing = new Set(itemsRef.current.map((item) => item.path.toLowerCase()))
      const fresh = accepted.filter((path) => !existing.has(path.toLowerCase()))
      if (fresh.length === 0) {
        setNotice('所选文件已在列表中')
        return
      }
      if (itemsRef.current.length + fresh.length > MAX_FILES) {
        setError(`一次最多合并 ${MAX_FILES} 个文件`)
        return
      }
      setError(null)
      setNotice(null)
      setJob(null)
      const placeholders: MergeItem[] = fresh.map((path) => ({
        key: createKey(path),
        path,
        name: baseName(path),
        size: 0,
        kind: '',
        pages: 0,
        status: 'probing',
        error: null
      }))
      setItems((previous) => [...previous, ...placeholders])
      try {
        const results = await probeFiles(backend, fresh)
        const byPath = new Map(results.map((result) => [result.path.toLowerCase(), result]))
        setItems((previous) =>
          previous.map((item) => {
            if (item.status !== 'probing') return item
            const hit = byPath.get(item.path.toLowerCase())
            if (!hit) {
              return { ...item, status: 'invalid', error: '无法读取该文件' }
            }
            if (hit.error) {
              return {
                ...item,
                status: 'invalid',
                name: hit.name,
                size: hit.size,
                kind: hit.kind,
                error: hit.error
              }
            }
            return {
              ...item,
              status: 'ready',
              name: hit.name,
              size: hit.size,
              kind: hit.kind,
              pages: hit.pages,
              error: null
            }
          })
        )
      } catch (reason) {
        setError(messageOf(reason))
        setItems((previous) =>
          previous.map((item) =>
            item.status === 'probing' ? { ...item, status: 'invalid', error: '读取失败' } : item
          )
        )
      }
    },
    [backend]
  )

  const pickFiles = useCallback(async () => {
    const paths = await window.adou.pickDocuments()
    if (paths.length > 0) await addPaths(paths)
  }, [addPaths])

  const pickOutput = useCallback(async () => {
    const path = await window.adou.pickMergeTarget({ target })
    if (path) {
      setOutputPath(path)
      setJob(null)
      setError(null)
    }
  }, [target])

  const changeTarget = useCallback((next: MergeTarget) => {
    setTarget(next)
    setOutputPath((previous) =>
      previous.replace(/\.(ofd|pdf)$/i, `.${next.toLowerCase()}`)
    )
    setJob(null)
    setNotice(null)
  }, [])

  const move = useCallback((from: number, to: number) => {
    setItems((previous) => {
      if (from === to || from < 0 || to < 0 || from >= previous.length || to >= previous.length) {
        return previous
      }
      const next = [...previous]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setJob(null)
  }, [])

  const remove = useCallback((key: string) => {
    setItems((previous) => previous.filter((item) => item.key !== key))
    setJob(null)
  }, [])

  const clearAll = useCallback(() => {
    if (runningRef.current) return
    setItems([])
    setJob(null)
    setError(null)
    setNotice(null)
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
    setStopping(true)
  }, [])

  const start = useCallback(async () => {
    if (runningRef.current) return
    const currentItems = itemsRef.current
    if (currentItems.length < 2) {
      setError('至少需要 2 个文件才能合并')
      return
    }
    if (currentItems.some((item) => item.status === 'probing')) {
      setError('请等待文件读取完成')
      return
    }
    if (currentItems.some((item) => item.status === 'invalid')) {
      setError('请先移除无法读取的文件')
      return
    }
    if (!outputPath) {
      setError('请先选择保存位置')
      return
    }

    setError(null)
    setNotice(null)
    setJob(null)
    stopRef.current = false
    runningRef.current = true
    startedAtRef.current = Date.now()
    setNow(Date.now())
    setRunning(true)
    setStopping(false)

    try {
      let current = await startMerge(backend, {
        files: currentItems.map((item) => item.path),
        target,
        outputPath,
        overwrite: true
      })
      setJob(current)
      let cancelSent = false
      let lastProgress = current.progress
      let lastPhase = current.phase
      let lastChangeAt = Date.now()
      let pollFailures = 0

      while (!TERMINAL.has(current.status)) {
        await sleep(POLL_INTERVAL)
        if (stopRef.current && !cancelSent) {
          cancelSent = true
          try {
            current = await cancelMerge(backend, current.id)
          } catch {
            // 取消失败时继续轮询，任务仍会自然结束
          }
          setJob(current)
          continue
        }
        try {
          current = await fetchMerge(backend, current.id)
          pollFailures = 0
        } catch (reason) {
          pollFailures += 1
          if (pollFailures >= MAX_POLL_FAILURES) {
            throw new Error(`与本地引擎的连接中断：${messageOf(reason)}`)
          }
          continue
        }
        if (current.progress !== lastProgress || current.phase !== lastPhase) {
          lastProgress = current.progress
          lastPhase = current.phase
          lastChangeAt = Date.now()
        } else if (Date.now() - lastChangeAt > STALL_TIMEOUT_MS) {
          void cancelMerge(backend, current.id).catch(() => undefined)
          throw new Error(
            `合并超过 ${Math.round(STALL_TIMEOUT_MS / 60_000)} 分钟没有进展，已停止等待；` +
              '请减少文件数量后重试'
          )
        }
        setJob(current)
      }

      if (current.status === 'FAILED') {
        setError(current.errorMessage ?? '合并失败')
      } else if (current.status === 'CANCELED') {
        setNotice('合并已取消')
      }
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      runningRef.current = false
      startedAtRef.current = null
      setRunning(false)
      setStopping(false)
    }
  }, [backend, outputPath, target])

  const readyItems = items.filter((item) => item.status === 'ready')
  const invalidCount = items.filter((item) => item.status === 'invalid').length
  const probing = items.some((item) => item.status === 'probing')
  const totalPages = readyItems.reduce((sum, item) => sum + item.pages, 0)
  const canStart =
    !running && readyItems.length >= 2 && readyItems.length === items.length && Boolean(outputPath)
  const elapsed =
    running && startedAtRef.current ? formatElapsed(now - startedAtRef.current) : ''
  const activeJob = job && (job.status === 'QUEUED' || job.status === 'RUNNING') ? job : null
  const result = job?.status === 'SUCCEEDED' ? job : null

  const summary = useMemo(
    () => ({ ready: readyItems.length, invalid: invalidCount, probing }),
    [readyItems.length, invalidCount, probing]
  )

  return (
    <div
      className={`merge ${dragOver ? 'drag' : ''}`}
      onDragOver={(event) => {
        if (running) return
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (running) return
        const files = Array.from(event.dataTransfer.files)
        if (files.length === 0) return
        event.preventDefault()
        setDragOver(false)
        const paths = files
          .map((file) => window.adou.getPathForFile(file))
          .filter((path): path is string => Boolean(path))
        if (paths.length > 0) void addPaths(paths)
      }}
    >
      <div className="batch-toolbar merge-toolbar">
        <button
          className="btn primary"
          data-action="merge-add"
          onClick={() => void pickFiles()}
          disabled={running}
        >
          <IconFolder size={16} />
          添加文件
        </button>
        <div className="merge-format" role="group" aria-label="输出格式">
          <span className="merge-format-label">输出为</span>
          <button
            type="button"
            className={`merge-format-btn ${target === 'OFD' ? 'active' : ''}`}
            data-action="merge-format-ofd"
            onClick={() => changeTarget('OFD')}
            disabled={running}
          >
            OFD
          </button>
          <button
            type="button"
            className={`merge-format-btn ${target === 'PDF' ? 'active' : ''}`}
            data-action="merge-format-pdf"
            onClick={() => changeTarget('PDF')}
            disabled={running}
          >
            PDF
          </button>
        </div>
        <button
          className="btn ghost"
          data-action="merge-output"
          onClick={() => void pickOutput()}
          disabled={running}
        >
          <IconFile size={16} />
          {outputPath ? '更换保存位置' : '选择保存位置'}
        </button>
        <div className="batch-toolbar-actions">
          {running ? (
            <button
              className="btn ghost"
              data-action="merge-stop"
              onClick={stop}
              disabled={stopping}
            >
              {stopping ? '正在停止…' : '停止'}
            </button>
          ) : null}
          <button
            className="btn primary"
            data-action="merge-start"
            onClick={() => void start()}
            disabled={!canStart}
          >
            {running ? <span className="btn-spinner" /> : <IconMerge size={16} />}
            {running ? '合并中' : '开始合并'}
          </button>
        </div>
      </div>

      <div className="merge-output-line">
        <span className={`merge-output-path ${outputPath ? '' : 'is-empty'}`} title={outputPath}>
          {outputPath || '尚未选择保存位置'}
        </span>
        {items.length > 0 && !running ? (
          <button className="batch-link" onClick={clearAll}>清空列表</button>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="batch-summary">
          <span>共 {items.length} 个文件</span>
          <span className="dot" />
          <span>可合并 {summary.ready}</span>
          {totalPages > 0 ? (
            <>
              <span className="dot" />
              <span>合计 {totalPages} 页</span>
            </>
          ) : null}
          {summary.probing ? (
            <>
              <span className="dot" />
              <span>读取中…</span>
            </>
          ) : null}
          {summary.invalid > 0 ? (
            <>
              <span className="dot" />
              <span className="warn">无法读取 {summary.invalid}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="batch-alert" role="alert">
          <IconAlert size={16} />
          <span>{error}</span>
          <button className="batch-link" onClick={() => setError(null)}>关闭</button>
        </div>
      ) : null}

      {notice ? (
        <div className="batch-note" role="status">
          <IconInfo size={15} />
          <span>{notice}</span>
          <button className="batch-link" onClick={() => setNotice(null)}>关闭</button>
        </div>
      ) : null}

      {activeJob ? (
        <div className="merge-progress" data-merge-progress={activeJob.progress}>
          <div className="batch-phase">
            {activeJob.phase}
            {elapsed ? ` · 已用 ${elapsed}` : ''}
          </div>
          <div className="batch-bar">
            <span style={{ width: `${Math.max(3, activeJob.progress)}%` }} />
          </div>
        </div>
      ) : null}

      {result && result.report ? (
        <div className="merge-result" data-merge-result="done">
          <div className="merge-result-head">
            <span className="merge-result-icon">
              <IconSpark size={18} />
            </span>
            <div className="merge-result-text">
              <strong>合并完成</strong>
              <span>
                {result.report.outputPages} 页 · {formatSize(result.report.outputBytes)} ·{' '}
                {formatDuration(result.report.durationMs)}
              </span>
            </div>
            <div className="merge-result-actions">
              <button
                className="btn ghost small"
                data-action="merge-view-result"
                onClick={() => onOpenDocument(result.outputPath)}
              >
                <IconView size={14} />
                查看
              </button>
              <button
                className="btn ghost small"
                data-action="merge-print-result"
                onClick={() => onPrintResult(result.outputPath)}
              >
                <IconPrint size={14} />
                打印
              </button>
              <button
                className="icon-btn"
                onClick={() => void window.adou.revealPath(result.outputPath)}
                title="在文件夹中显示"
              >
                <IconLocation size={14} />
              </button>
            </div>
          </div>
          {result.report.warnings.length > 0 ? (
            <ul className="merge-warnings">
              {result.report.warnings.map((warning) => (
                <li key={warning}>
                  <IconInfo size={13} />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="batch-drop">
          <div className="batch-drop-art">
            <IconMerge size={30} />
          </div>
          <h2>合并 OFD / PDF</h2>
          <p>
            把多个 .ofd / .pdf 文件拖到这里，或点击“添加文件”。
            <br />
            拖动左侧手柄或使用上下按钮调整顺序，再按所选格式合并为一个文档。
            <br />
            混合格式会先转换到 OFD / PDF，文件只在本机处理。
          </p>
          <div className="batch-drop-actions">
            <button className="btn ghost" onClick={() => void pickFiles()}>
              <IconFolder size={16} />
              选择文件
            </button>
          </div>
        </div>
      ) : (
        <div className="merge-list">
          {items.map((item, index) => (
            <div
              className={`merge-row ${item.status} ${draggingIndex === index ? 'dragging' : ''}`}
              key={item.key}
              data-merge-row={item.status}
              data-merge-index={index}
              onDragOver={(event) => {
                if (running || dragIndexRef.current === null) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                if (running || dragIndexRef.current === null) return
                event.preventDefault()
                event.stopPropagation()
                const from = dragIndexRef.current
                dragIndexRef.current = null
                setDraggingIndex(null)
                move(from, index)
              }}
            >
              <span className="merge-order">{index + 1}</span>
              <span
                className={`merge-handle ${running ? 'disabled' : ''}`}
                draggable={!running}
                onDragStart={(event) => {
                  if (running) return
                  dragIndexRef.current = index
                  setDraggingIndex(index)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', String(index))
                }}
                onDragEnd={() => {
                  dragIndexRef.current = null
                  setDraggingIndex(null)
                }}
                title="拖动调整顺序"
              >
                ⠿
              </span>
              <div className="batch-file">
                <span className={`format-badge ${(item.kind || 'ofd').toLowerCase()}`}>
                  {item.kind || '…'}
                </span>
                <div className="batch-file-text">
                  <span className="batch-name" title={item.path}>{item.name}</span>
                  <span className={`batch-meta ${item.status === 'invalid' ? 'merge-meta-error' : ''}`}>
                    {item.status === 'probing'
                      ? '读取中…'
                      : item.status === 'invalid'
                        ? item.error ?? '无法读取'
                        : `${item.pages} 页${item.size > 0 ? ` · ${formatSize(item.size)}` : ''}`}
                  </span>
                </div>
              </div>
              <div className="merge-row-actions">
                <button
                  type="button"
                  className="merge-view"
                  data-action="merge-view"
                  title="在阅读器中查看该文件"
                  aria-label="查看该文件"
                  disabled={item.status !== 'ready'}
                  onClick={() => onOpenDocument(item.path)}
                >
                  <IconView size={15} />
                </button>
                <div className="merge-sort" role="group" aria-label="调整顺序">
                  <button
                    type="button"
                    className="merge-sort-btn"
                    data-action="merge-up"
                    title="上移"
                    aria-label="上移"
                    disabled={running || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <IconChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="merge-sort-btn"
                    data-action="merge-down"
                    title="下移"
                    aria-label="下移"
                    disabled={running || index === items.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <IconChevronDown size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  className="merge-remove"
                  data-action="merge-remove"
                  onClick={() => remove(item.key)}
                  disabled={running}
                  title="从列表移除"
                  aria-label="从列表移除"
                >
                  <IconClose size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

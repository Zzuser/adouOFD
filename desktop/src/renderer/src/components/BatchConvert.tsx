import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackendInfo, ConversionJob, ConversionReport } from '@shared/types'
import {
  ApiRequestError,
  cancelConversion,
  fetchConversion,
  messageOf,
  probeFiles,
  startConversion
} from '../api'
import {
  IconAlert,
  IconClose,
  IconFile,
  IconFolder,
  IconInfo,
  IconLocation,
  IconPrint,
  IconSpark,
  IconSwap,
  IconView
} from './icons'

const OUTPUT_KEY = 'adou.batch.outDir'
const POLL_INTERVAL = 350
const MAX_SUFFIX = 40
const STALL_TIMEOUT_MS = 180_000
const MAX_POLL_FAILURES = 5
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])

type ItemStatus = 'probing' | 'pending' | 'running' | 'done' | 'failed' | 'canceled' | 'invalid'

interface BatchItem {
  key: string
  path: string
  name: string
  size: number
  kind: string
  pages: number
  target: string
  status: ItemStatus
  progress: number
  phase: string
  outputPath: string | null
  report: ConversionReport | null
  error: string | null
  startedAt: number | null
}

interface BatchConvertProps {
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

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index >= 0 ? path.slice(index + 1) : path
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function createKey(path: string): string {
  return `${path}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function BatchConvert({ backend, onOpenDocument, onPrintResult }: BatchConvertProps) {
  const [items, setItems] = useState<BatchItem[]>([])
  const [outputDir, setOutputDir] = useState<string>(() => {
    try {
      return window.localStorage.getItem(OUTPUT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const itemsRef = useRef<BatchItem[]>([])
  const dirRef = useRef(outputDir)
  const runningRef = useRef(false)
  const stopRef = useRef(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    dirRef.current = outputDir
    try {
      if (outputDir) window.localStorage.setItem(OUTPUT_KEY, outputDir)
    } catch {
      // 本地存储不可用时仅保留当前会话
    }
  }, [outputDir])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const patch = useCallback((key: string, changes: Partial<BatchItem>) => {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...changes } : item))
    )
  }, [])

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
      setError(null)
      setNotice(null)
      const placeholders: BatchItem[] = fresh.map((path) => ({
        key: createKey(path),
        path,
        name: baseName(path),
        size: 0,
        kind: '',
        pages: 0,
        target: '',
        status: 'probing',
        progress: 0,
        phase: '读取中',
        outputPath: null,
        report: null,
        error: null,
        startedAt: null
      }))
      setItems((previous) => [...previous, ...placeholders])
      try {
        const results = await probeFiles(backend, fresh)
        const byPath = new Map(results.map((result) => [result.path.toLowerCase(), result]))
        setItems((previous) =>
          previous.map((item) => {
            const hit = byPath.get(item.path.toLowerCase())
            if (!hit) {
              return item.status === 'probing'
                ? { ...item, status: 'invalid', error: '无法读取该文件' }
                : item
            }
            if (hit.error) {
              return {
                ...item,
                status: 'invalid',
                size: hit.size,
                kind: hit.kind,
                error: hit.error
              }
            }
            return {
              ...item,
              status: 'pending',
              name: hit.name,
              size: hit.size,
              kind: hit.kind,
              pages: hit.pages,
              target: hit.kind === 'PDF' ? 'OFD' : 'PDF',
              phase: '',
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

  const pickOutputDir = useCallback(async () => {
    const dir = await window.adou.pickDirectory()
    if (dir) {
      setOutputDir(dir)
      setError(null)
    }
  }, [])

  const submitWithUniqueName = useCallback(
    async (item: BatchItem, dir: string): Promise<ConversionJob> => {
      const base = item.name.replace(/\.[^.]+$/, '')
      const extension = item.target.toLowerCase()
      const normalizedDir = dir.replace(/[\\/]+$/, '')
      for (let index = 0; index < MAX_SUFFIX; index += 1) {
        const suffix = index === 0 ? '' : ` (${index})`
        const outputPath = `${normalizedDir}\\${base}${suffix}.${extension}`
        try {
          return await startConversion(backend, {
            sourcePath: item.path,
            target: item.target,
            outputPath,
            overwrite: false
          })
        } catch (reason) {
          if (reason instanceof ApiRequestError && reason.code === 'OUTPUT_EXISTS') {
            continue
          }
          throw reason
        }
      }
      throw new Error('同名文件过多，请更换输出目录')
    },
    [backend]
  )

  const convertOne = useCallback(
    async (key: string, dir: string) => {
      const item = itemsRef.current.find((entry) => entry.key === key)
      if (!item) return
      patch(key, {
        status: 'running',
        progress: 0,
        phase: '准备转换',
        error: null,
        startedAt: Date.now()
      })
      try {
        let job = await submitWithUniqueName(item, dir)
        patch(key, {
          outputPath: job.outputPath,
          progress: job.progress,
          phase: job.phase
        })
        let cancelSent = false
        let lastProgress = job.progress
        let lastChangeAt = Date.now()
        let pollFailures = 0
        while (!TERMINAL.has(job.status)) {
          await sleep(POLL_INTERVAL)
          if (stopRef.current && !cancelSent) {
            cancelSent = true
            try {
              job = await cancelConversion(backend, job.id)
            } catch {
              // 取消失败时继续轮询，任务仍会自然结束
            }
            patch(key, { phase: '正在取消…' })
            continue
          }
          try {
            job = await fetchConversion(backend, job.id)
            pollFailures = 0
          } catch (reason) {
            pollFailures += 1
            if (pollFailures >= MAX_POLL_FAILURES) {
              throw new Error(`与本地引擎的连接中断：${messageOf(reason)}`)
            }
            continue
          }
          if (job.progress !== lastProgress) {
            lastProgress = job.progress
            lastChangeAt = Date.now()
          } else if (Date.now() - lastChangeAt > STALL_TIMEOUT_MS) {
            // 引擎无响应（例如内存耗尽后线程已死）时不能让界面无限等待
            void cancelConversion(backend, job.id).catch(() => undefined)
            throw new Error(
              `转换超过 ${Math.round(STALL_TIMEOUT_MS / 60_000)} 分钟没有进展，已停止等待；` +
                '可重试或把文档拆分后再转换'
            )
          }
          patch(key, { progress: job.progress, phase: job.phase })
        }
        if (job.status === 'SUCCEEDED') {
          patch(key, {
            status: 'done',
            progress: 100,
            phase: '完成',
            report: job.report,
            outputPath: job.outputPath
          })
        } else if (job.status === 'CANCELED') {
          patch(key, { status: 'canceled', phase: '已取消' })
        } else {
          patch(key, { status: 'failed', error: job.errorMessage ?? '转换失败' })
        }
      } catch (reason) {
        patch(key, { status: 'failed', error: messageOf(reason) })
      }
    },
    [backend, patch, submitWithUniqueName]
  )

  const start = useCallback(async () => {
    if (runningRef.current) return
    const dir = dirRef.current
    if (!dir) {
      setError('请先选择输出目录')
      return
    }
    const queue = itemsRef.current.filter(
      (item) => item.status === 'pending' || item.status === 'failed' || item.status === 'canceled'
    )
    if (queue.length === 0) {
      setNotice('没有待转换的文件')
      return
    }
    setError(null)
    setNotice(null)
    stopRef.current = false
    runningRef.current = true
    setRunning(true)
    setStopping(false)
    for (const item of queue) {
      if (stopRef.current) break
      await convertOne(item.key, dir)
    }
    runningRef.current = false
    setRunning(false)
    setStopping(false)
  }, [convertOne])

  const stop = useCallback(() => {
    stopRef.current = true
    setStopping(true)
  }, [])

  const remove = useCallback((key: string) => {
    setItems((previous) => previous.filter((item) => item.key !== key))
  }, [])

  const clearFinished = useCallback(() => {
    setItems((previous) =>
      previous.filter((item) => item.status !== 'done' && item.status !== 'canceled')
    )
  }, [])

  const summary = useMemo(() => {
    const done = items.filter((item) => item.status === 'done').length
    const failed = items.filter((item) => item.status === 'failed' || item.status === 'invalid').length
    const pending = items.filter((item) => item.status === 'pending').length
    return { total: items.length, done, failed, pending }
  }, [items])

  return (
    <div
      className={`batch ${dragOver ? 'drag' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!running) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        if (running) return
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.adou.getPathForFile(file))
          .filter((path): path is string => Boolean(path))
        if (paths.length > 0) void addPaths(paths)
      }}
    >
      <div className="batch-toolbar">
        <button
          className="btn primary"
          data-action="batch-add"
          onClick={() => void pickFiles()}
          disabled={running}
        >
          <IconFolder size={16} />
          添加文件
        </button>
        <button
          className="btn ghost"
          data-action="batch-output"
          onClick={() => void pickOutputDir()}
          disabled={running}
        >
          <IconFile size={16} />
          {outputDir ? '更换输出目录' : '选择输出目录'}
        </button>
        <span className={`batch-dir ${outputDir ? '' : 'is-empty'}`} title={outputDir}>
          {outputDir || '尚未选择输出目录'}
        </span>
        <div className="batch-toolbar-actions">
          {running ? (
            <button
              className="btn ghost"
              data-action="batch-stop"
              onClick={stop}
              disabled={stopping}
            >
              {stopping ? '正在停止…' : '停止'}
            </button>
          ) : null}
          <button
            className="btn primary"
            data-action="batch-start"
            onClick={() => void start()}
            disabled={running}
            title={outputDir ? undefined : '请先选择输出目录'}
          >
            {running ? <span className="btn-spinner" /> : <IconSwap size={16} />}
            {running ? '转换中' : '开始转换'}
          </button>
        </div>
      </div>

      {summary.total > 0 ? (
        <div className="batch-summary">
          <span>共 {summary.total} 个文件</span>
          <span className="dot" />
          <span>完成 {summary.done}</span>
          <span className="dot" />
          <span>待转换 {summary.pending}</span>
          {summary.failed > 0 ? (
            <>
              <span className="dot" />
              <span className="warn">失败 {summary.failed}</span>
            </>
          ) : null}
          {!running && summary.done > 0 ? (
            <button className="batch-link" onClick={clearFinished}>清空已完成</button>
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

      {items.length === 0 ? (
        <div className="batch-drop">
          <div className="batch-drop-art">
            <IconSwap size={30} />
          </div>
          <h2>批量转换 OFD / PDF</h2>
          <p>
            把多个 .ofd / .pdf 文件拖到这里，或点击“添加文件”。
            <br />
            每个文件自动转换到另一种格式，结果写入所选目录，原文件不改动。
          </p>
          <div className="batch-drop-actions">
            <button className="btn ghost" onClick={() => void pickFiles()}>
              <IconSpark size={16} />
              选择文件
            </button>
          </div>
        </div>
      ) : (
        <div className="batch-list">
          {items.map((item) => (
            <div className={`batch-row ${item.status}`} key={item.key} data-batch-row={item.status}>
              <div className="batch-file">
                <span className={`format-badge ${(item.kind || 'ofd').toLowerCase()}`}>
                  {item.kind || '…'}
                </span>
                <div className="batch-file-text">
                  <span className="batch-name" title={item.path}>{item.name}</span>
                  <span className="batch-meta">
                    {item.pages > 0 ? `${item.pages} 页` : ''}
                    {item.size > 0 ? ` · ${formatSize(item.size)}` : ''}
                    {item.target ? ` · 转为 ${item.target}` : ''}
                  </span>
                </div>
              </div>

              <div className="batch-state">
                {item.status === 'running' ? (
                  <div className="batch-progress">
                    <span className="batch-phase">
                      {item.phase}
                      {item.startedAt ? ` · 已用 ${formatElapsed(now - item.startedAt)}` : ''}
                    </span>
                    <div className="batch-bar">
                      <span style={{ width: `${Math.max(3, item.progress)}%` }} />
                    </div>
                  </div>
                ) : item.status === 'done' ? (
                  <span className="batch-chip done">
                    {item.report
                      ? `${item.report.outputPages} 页 · ${formatSize(item.report.outputBytes)}`
                      : '完成'}
                  </span>
                ) : item.status === 'failed' || item.status === 'invalid' ? (
                  <span className="batch-chip failed" title={item.error ?? ''}>
                    {item.error ?? '失败'}
                  </span>
                ) : item.status === 'canceled' ? (
                  <span className="batch-chip muted">已取消</span>
                ) : item.status === 'probing' ? (
                  <span className="batch-chip muted">读取中…</span>
                ) : (
                  <span className="batch-chip pending">待转换</span>
                )}
              </div>

              <div className="batch-row-actions">
                {item.report && item.report.warnings.length > 0 ? (
                  <span className="batch-warn" title={item.report.warnings.join('\n')}>
                    <IconInfo size={14} />
                  </span>
                ) : null}
                {item.status !== 'probing' && item.status !== 'invalid' ? (
                  <button
                    className="icon-btn"
                    data-action="batch-view"
                    onClick={() =>
                      onOpenDocument(
                        item.status === 'done' && item.outputPath ? item.outputPath : item.path
                      )
                    }
                    title={
                      item.status === 'done' && item.outputPath
                        ? '在阅读器中查看转换结果'
                        : '在阅读器中查看源文件'
                    }
                  >
                    <IconView size={14} />
                    查看
                  </button>
                ) : null}
                {item.status === 'done' && item.outputPath ? (
                  <button
                    className="icon-btn"
                    data-action="batch-print"
                    onClick={() => onPrintResult(item.outputPath as string)}
                    title="打印转换结果"
                  >
                    <IconPrint size={14} />
                    打印
                  </button>
                ) : null}
                {item.status === 'done' && item.outputPath ? (
                  <button
                    className="icon-btn"
                    onClick={() => void window.adou.revealPath(item.outputPath as string)}
                    title="在文件夹中显示"
                  >
                    <IconLocation size={14} />
                  </button>
                ) : null}
                {!running ? (
                  <button
                    className="icon-btn"
                    onClick={() => remove(item.key)}
                    title="从列表移除"
                  >
                    <IconClose size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

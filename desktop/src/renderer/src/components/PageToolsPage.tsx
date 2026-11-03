import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BackendInfo,
  InsertPositionMode,
  PageMeta,
  PageToolJob,
  SplitMode
} from '@shared/types'
import {
  cancelPageTool,
  closePreview,
  fetchPageTool,
  messageOf,
  openPreview,
  previewImageUrl,
  probeFiles,
  startInsert,
  startSplit
} from '../api'
import {
  IconAlert,
  IconClose,
  IconFile,
  IconFolder,
  IconInfo,
  IconLocation,
  IconPages,
  IconPlus,
  IconPrint,
  IconSpark,
  IconView
} from './icons'

const POLL_INTERVAL = 350
const STALL_TIMEOUT_MS = 180_000
const MAX_POLL_FAILURES = 5
const MAX_OUTPUTS = 300
const MAX_PAGES_PER_FILE = 999
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])

type ToolMode = 'split' | 'insert'
type DocStatus = 'probing' | 'ready' | 'invalid'

interface PageDoc {
  path: string
  name: string
  size: number
  kind: 'OFD' | 'PDF' | ''
  pages: number
  status: DocStatus
  error: string | null
}

interface RangeParse {
  groups: number[][]
  error: string | null
}

interface SplitPreview {
  count: number
  pages: number
  error: string | null
}

interface PageToolsPageProps {
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
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)} ms`
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

function stem(path: string): string {
  return baseName(path).replace(/\.[^.]+$/, '')
}

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index > 0 ? path.slice(0, index) : ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function emptyDoc(path: string): PageDoc {
  return {
    path,
    name: baseName(path),
    size: 0,
    kind: '',
    pages: 0,
    status: 'probing',
    error: null
  }
}

function jobDuration(job: PageToolJob): string {
  if (!job.startedAt || !job.finishedAt) return ''
  return formatDuration(new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime())
}

interface PreviewSession {
  id: string
  pages: PageMeta[]
}

interface PreviewState {
  session: PreviewSession | null
  loading: boolean
  error: string | null
}

function usePagePreview(backend: BackendInfo, doc: PageDoc | null): PreviewState {
  const [state, setState] = useState<PreviewState>({
    session: null,
    loading: false,
    error: null
  })
  const idRef = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    const closeCurrent = () => {
      const id = idRef.current
      if (id) {
        idRef.current = null
        void closePreview(backend, id).catch(() => undefined)
      }
    }

    closeCurrent()
    setState({ session: null, loading: false, error: null })
    if (
      !doc ||
      doc.status !== 'ready' ||
      backend.status !== 'ready' ||
      !backend.port
    ) {
      return
    }

    setState({ session: null, loading: true, error: null })
    void openPreview(backend, doc.path)
      .then((summary) => {
        if (!alive) {
          void closePreview(backend, summary.id).catch(() => undefined)
          return
        }
        idRef.current = summary.id
        setState({
          session: { id: summary.id, pages: summary.pages },
          loading: false,
          error: null
        })
      })
      .catch((reason: unknown) => {
        if (alive) {
          setState({ session: null, loading: false, error: messageOf(reason) })
        }
      })

    return () => {
      alive = false
      closeCurrent()
    }
  }, [backend.status, backend.port, backend.token, doc?.path, doc?.status])

  return state
}

/**
 * 与后端 PageRanges 保持同一语义：逗号分组，每组输出一个文件；
 * 组内空格分隔的页码会合并到同一组。
 */
function parseRanges(raw: string, pageCount: number): RangeParse {
  const normalized = raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[，；;]/g, ',')
    .replace(/[－—–~～至到]/g, '-')
    .trim()
  if (!normalized) {
    return { groups: [], error: null }
  }
  const groups: number[][] = []
  for (const part of normalized.split(',')) {
    const groupText = part.trim()
    if (!groupText) continue
    const pages: number[] = []
    for (const token of groupText.split(/[\s、]+/)) {
      if (!token) continue
      const match = /^(\d+)(?:-(\d+))?$/.exec(token)
      if (!match) {
        return { groups: [], error: `页码范围格式不正确：${token}` }
      }
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : start
      if (start < 1 || end < 1 || end > pageCount) {
        return { groups: [], error: `页码超出范围（1-${pageCount}）：${token}` }
      }
      if (start > end) {
        return { groups: [], error: `起始页不能大于结束页：${token}` }
      }
      for (let page = start; page <= end; page++) {
        pages.push(page)
      }
    }
    if (pages.length === 0) {
      return { groups: [], error: `页码范围格式不正确：${groupText}` }
    }
    groups.push(pages)
  }
  if (groups.length === 0) {
    return { groups: [], error: '请填写有效的页码范围' }
  }
  return { groups, error: null }
}

interface PagePreviewPanelProps {
  backend: BackendInfo
  title: string
  hint?: string
  state: PreviewState
  loading?: boolean
  selectedPages?: Set<number> | null
  groupByPage?: Map<number, number> | null
  insertMarkerBefore?: number | null
  emptyText?: string
}

function PagePreviewPanel({
  backend,
  title,
  hint,
  state,
  loading = false,
  selectedPages = null,
  groupByPage = null,
  insertMarkerBefore = null,
  emptyText = '选择文件后显示页面预览'
}: PagePreviewPanelProps) {
  const session = state.session
  const marker = (
    <div className="page-preview-marker">
      <span>插入位置</span>
    </div>
  )

  return (
    <section className="page-preview-panel" data-preview-panel={title}>
      <div className="page-preview-head">
        <strong>{title}</strong>
        {session ? <span>{session.pages.length} 页</span> : null}
        {loading || state.loading ? <span>读取中…</span> : null}
        {hint ? <span className="page-preview-hint">{hint}</span> : null}
      </div>
      <div className="page-preview-scroll">
        {loading || state.loading ? (
          <div className="page-preview-empty">
            <span className="spinner" />
            正在生成页面预览…
          </div>
        ) : state.error ? (
          <div className="page-preview-empty error">{state.error}</div>
        ) : session ? (
          <div className="page-preview-grid">
            {session.pages.map((page) => {
              const selected = !selectedPages || selectedPages.has(page.index)
              const group = groupByPage?.get(page.index)
              return (
                <Fragment key={page.index}>
                  {insertMarkerBefore === page.index ? marker : null}
                  <div
                    className={`page-preview-item ${selected ? '' : 'dimmed'} ${
                      group ? 'grouped' : ''
                    }`}
                    data-preview-page={page.index}
                    title={`第 ${page.index} 页`}
                  >
                    <div
                      className="page-preview-frame"
                      style={{
                        aspectRatio: `${page.widthMm || 210} / ${page.heightMm || 297}`
                      }}
                    >
                      <img
                        src={previewImageUrl(backend, session.id, page.index, 24)}
                        alt=""
                        loading={page.index <= 12 ? 'eager' : 'lazy'}
                        decoding="async"
                        draggable={false}
                      />
                      {group ? (
                        <span
                          className={`page-preview-group g${((group - 1) % 6) + 1}`}
                          title={`第 ${group} 个文件`}
                        >
                          {group}
                        </span>
                      ) : null}
                    </div>
                    <span className="page-preview-label">{page.index}</span>
                  </div>
                </Fragment>
              )
            })}
            {insertMarkerBefore === session.pages.length + 1 ? marker : null}
          </div>
        ) : (
          <div className="page-preview-empty">{emptyText}</div>
        )}
      </div>
    </section>
  )
}

interface FileSlotProps {
  title: string
  hint: string
  doc: PageDoc | null
  large?: boolean
  disabled?: boolean
  pickAction: string
  clearAction: string
  onPick: () => void
  onDropPath: (path: string) => void
  onClear: () => void
}

function FileSlot({
  title,
  hint,
  doc,
  large = false,
  disabled = false,
  pickAction,
  clearAction,
  onPick,
  onDropPath,
  onClear
}: FileSlotProps) {
  const [dragOver, setDragOver] = useState(false)
  const kind = doc?.kind ?? ''

  return (
    <div
      className={`file-slot ${doc ? 'has-file' : ''} ${dragOver ? 'drag' : ''} ${
        large ? 'large' : ''
      }`}
      onDragOver={(event) => {
        if (disabled) return
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (disabled) return
        const file = event.dataTransfer.files[0]
        if (!file) return
        event.preventDefault()
        setDragOver(false)
        const path = window.adou.getPathForFile(file)
        if (path) onDropPath(path)
      }}
    >
      <div className="file-slot-label">
        <span>{title}</span>
        {doc ? (
          <span className={`format-badge ${kind.toLowerCase() || 'ofd'}`}>{kind || '…'}</span>
        ) : null}
      </div>

      {doc ? (
        <>
          <div className="file-slot-file">
            <span className="file-slot-icon">
              <IconFile size={20} />
            </span>
            <div className="file-slot-info">
              <span className="file-slot-name" title={doc.path}>
                {doc.name}
              </span>
              <span className={`file-slot-meta ${doc.status === 'invalid' ? 'error' : ''}`}>
                {doc.status === 'probing'
                  ? '读取中…'
                  : doc.status === 'invalid'
                    ? doc.error ?? '无法读取该文件'
                    : `${doc.pages} 页${doc.size > 0 ? ` · ${formatSize(doc.size)}` : ''}`}
              </span>
              <span className="file-slot-path" title={doc.path}>
                {doc.path}
              </span>
            </div>
          </div>
          <div className="file-slot-actions">
            <button
              type="button"
              className="btn ghost small"
              data-action={pickAction}
              onClick={onPick}
              disabled={disabled}
            >
              <IconFolder size={14} />
              更换文件
            </button>
            <button
              type="button"
              className="icon-btn"
              data-action={clearAction}
              onClick={onClear}
              disabled={disabled}
              title="移除"
              aria-label="移除"
            >
              <IconClose size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="file-slot-empty">
          <span className="file-slot-empty-art">
            <IconFile size={large ? 30 : 24} />
          </span>
          <strong>{large ? '拖入 OFD / PDF 开始' : '尚未选择文件'}</strong>
          <span>{hint}</span>
          <button
            type="button"
            className="btn ghost"
            data-action={pickAction}
            onClick={onPick}
            disabled={disabled}
          >
            <IconFolder size={16} />
            选择文件
          </button>
        </div>
      )}
    </div>
  )
}

export function PageToolsPage({ backend, onOpenDocument, onPrintResult }: PageToolsPageProps) {
  const [mode, setMode] = useState<ToolMode>('split')
  const [splitDoc, setSplitDoc] = useState<PageDoc | null>(null)
  const [splitMode, setSplitMode] = useState<SplitMode>('PAGE')
  const [pagesPerFile, setPagesPerFile] = useState('10')
  const [ranges, setRanges] = useState('')
  const [baseNameInput, setBaseNameInput] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [baseDoc, setBaseDoc] = useState<PageDoc | null>(null)
  const [insertDoc, setInsertDoc] = useState<PageDoc | null>(null)
  const [insertRanges, setInsertRanges] = useState('')
  const [positionMode, setPositionMode] = useState<InsertPositionMode>('END')
  const [positionPage, setPositionPage] = useState(1)
  const [insertOutput, setInsertOutput] = useState('')
  const [job, setJob] = useState<PageToolJob | null>(null)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const runningRef = useRef(false)
  const stopRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)
  const splitDocPathRef = useRef<string | null>(null)
  const baseDocPathRef = useRef<string | null>(null)
  const splitSeq = useRef(0)
  const baseSeq = useRef(0)
  const insertSeq = useRef(0)

  const splitPagePreview = usePagePreview(backend, splitDoc)
  const basePagePreview = usePagePreview(backend, baseDoc)
  const insertPagePreview = usePagePreview(backend, insertDoc)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    if (splitDoc?.status !== 'ready' || splitDoc.path === splitDocPathRef.current) {
      return
    }
    splitDocPathRef.current = splitDoc.path
    setBaseNameInput(stem(splitDoc.name))
    setOutputDir((previous) => previous || dirname(splitDoc.path))
    setJob(null)
    setError(null)
    setNotice(null)
  }, [splitDoc])

  useEffect(() => {
    if (baseDoc?.status !== 'ready') return
    setPositionPage((previous) => Math.min(Math.max(1, previous), baseDoc.pages))
  }, [baseDoc])

  useEffect(() => {
    if (!baseDoc) {
      baseDocPathRef.current = null
      return
    }
    if (baseDoc.status === 'ready' && baseDoc.path !== baseDocPathRef.current) {
      baseDocPathRef.current = baseDoc.path
      setInsertOutput('')
    }
  }, [baseDoc])

  const resetResult = useCallback(() => {
    if (runningRef.current) return
    setJob(null)
    setError(null)
    setNotice(null)
  }, [])

  const loadDoc = useCallback(
    async (
      path: string,
      sequence: { current: number },
      apply: (doc: PageDoc | null) => void
    ) => {
      if (!/\.(ofd|pdf)$/i.test(path)) {
        setError('仅支持 .ofd 与 .pdf 文件')
        return
      }
      const token = ++sequence.current
      resetResult()
      apply(emptyDoc(path))
      try {
        const [hit] = await probeFiles(backend, [path])
        if (sequence.current !== token) return
        if (!hit || hit.error) {
          apply({
            ...emptyDoc(path),
            name: hit?.name ?? baseName(path),
            size: hit?.size ?? 0,
            kind: hit?.kind === 'PDF' ? 'PDF' : hit?.kind === 'OFD' ? 'OFD' : '',
            status: 'invalid',
            error: hit?.error ?? '无法读取该文件'
          })
          return
        }
        apply({
          path: hit.path,
          name: hit.name,
          size: hit.size,
          kind: hit.kind === 'PDF' ? 'PDF' : 'OFD',
          pages: hit.pages,
          status: 'ready',
          error: null
        })
      } catch (reason) {
        if (sequence.current === token) {
          apply({ ...emptyDoc(path), status: 'invalid', error: messageOf(reason) })
        }
      }
    },
    [backend, resetResult]
  )

  const pickInto = useCallback(
    async (sequence: { current: number }, apply: (doc: PageDoc | null) => void) => {
      const path = await window.adou.pickDocument()
      if (path) await loadDoc(path, sequence, apply)
    },
    [loadDoc]
  )

  const pickSplitDir = useCallback(async () => {
    const dir = await window.adou.pickDirectory({ title: '选择拆分结果保存目录' })
    if (dir) {
      setOutputDir(dir)
      resetResult()
    }
  }, [resetResult])

  const pickInsertOutput = useCallback(async () => {
    if (!baseDoc || baseDoc.status !== 'ready' || !baseDoc.kind) {
      setError('请先选择主文档')
      return
    }
    const path = await window.adou.pickPageTarget({
      target: baseDoc.kind,
      defaultName: `${stem(baseDoc.name)}-插入页`
    })
    if (path) {
      setInsertOutput(path)
      resetResult()
    }
  }, [baseDoc, resetResult])

  const changeMode = useCallback(
    (next: ToolMode) => {
      if (runningRef.current || next === mode) return
      setMode(next)
      setError(null)
      setNotice(null)
      setJob(null)
    },
    [mode]
  )

  const clearSplit = useCallback(() => {
    if (runningRef.current) return
    splitDocPathRef.current = null
    setSplitDoc(null)
    setBaseNameInput('')
    setRanges('')
    setSplitMode('PAGE')
    setPagesPerFile('10')
    setJob(null)
    setError(null)
    setNotice(null)
  }, [])

  const clearInsert = useCallback(() => {
    if (runningRef.current) return
    setBaseDoc(null)
    setInsertDoc(null)
    setInsertRanges('')
    setPositionMode('END')
    setPositionPage(1)
    setInsertOutput('')
    setJob(null)
    setError(null)
    setNotice(null)
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
    setStopping(true)
  }, [])

  const runJob = useCallback(
    async (initial: PageToolJob) => {
      runningRef.current = true
      stopRef.current = false
      startedAtRef.current = Date.now()
      setNow(Date.now())
      setRunning(true)
      setStopping(false)
      setJob(initial)
      try {
        let current = initial
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
              current = await cancelPageTool(backend, current.id)
            } catch {
              // 取消失败时继续轮询，任务仍会自然结束
            }
            setJob(current)
            continue
          }
          try {
            current = await fetchPageTool(backend, current.id)
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
            void cancelPageTool(backend, current.id).catch(() => undefined)
            throw new Error(
              `任务超过 ${Math.round(STALL_TIMEOUT_MS / 60_000)} 分钟没有进展，已停止等待；请减少页数后重试`
            )
          }
          setJob(current)
        }

        if (current.status === 'FAILED') {
          setError(current.errorMessage ?? (current.operation === 'SPLIT' ? '拆分失败' : '插入失败'))
        } else if (current.status === 'CANCELED') {
          setNotice(current.operation === 'SPLIT' ? '拆分已取消' : '插入已取消')
        }
      } catch (reason) {
        setError(messageOf(reason))
      } finally {
        runningRef.current = false
        startedAtRef.current = null
        setRunning(false)
        setStopping(false)
      }
    },
    [backend]
  )

  const splitPreview = useMemo<SplitPreview | null>(() => {
    if (!splitDoc || splitDoc.status !== 'ready') return null
    if (splitMode === 'PAGE') {
      const count = splitDoc.pages
      if (count > MAX_OUTPUTS) {
        return {
          count,
          pages: count,
          error: `一次最多生成 ${MAX_OUTPUTS} 个文件，请改用每 N 页或按区间拆分`
        }
      }
      return { count, pages: count, error: null }
    }
    if (splitMode === 'CHUNK') {
      const size = Number(pagesPerFile)
      if (!pagesPerFile.trim() || !Number.isInteger(size) || size < 1 || size > MAX_PAGES_PER_FILE) {
        return {
          count: 0,
          pages: 0,
          error: `每组页数应为 1-${MAX_PAGES_PER_FILE}`
        }
      }
      const count = Math.ceil(splitDoc.pages / size)
      return {
        count,
        pages: splitDoc.pages,
        error:
          count > MAX_OUTPUTS
            ? `一次最多生成 ${MAX_OUTPUTS} 个文件，请增大每组页数`
            : null
      }
    }
    if (!ranges.trim()) {
      return { count: 0, pages: 0, error: '请填写页码范围' }
    }
    const parsed = parseRanges(ranges, splitDoc.pages)
    if (parsed.error) return { count: 0, pages: 0, error: parsed.error }
    const pages = parsed.groups.reduce((sum, group) => sum + group.length, 0)
    return {
      count: parsed.groups.length,
      pages,
      error:
        parsed.groups.length > MAX_OUTPUTS
          ? `一次最多生成 ${MAX_OUTPUTS} 个文件，请减少区间数量`
          : null
    }
  }, [splitDoc, splitMode, pagesPerFile, ranges])

  const splitGroups = useMemo<number[][]>(() => {
    if (!splitDoc || splitDoc.status !== 'ready') return []
    if (splitMode === 'PAGE') {
      return Array.from({ length: splitDoc.pages }, (_, index) => [index + 1])
    }
    if (splitMode === 'CHUNK') {
      const size = Number(pagesPerFile)
      if (!pagesPerFile.trim() || !Number.isInteger(size) || size < 1) return []
      const groups: number[][] = []
      for (let start = 1; start <= splitDoc.pages; start += size) {
        const end = Math.min(splitDoc.pages, start + size - 1)
        groups.push(Array.from({ length: end - start + 1 }, (_, index) => start + index))
      }
      return groups
    }
    if (!ranges.trim()) return []
    const parsed = parseRanges(ranges, splitDoc.pages)
    return parsed.error ? [] : parsed.groups
  }, [splitDoc, splitMode, pagesPerFile, ranges])

  const splitGroupByPage = useMemo(() => {
    const map = new Map<number, number>()
    splitGroups.forEach((group, index) => {
      for (const page of group) {
        if (!map.has(page)) map.set(page, index + 1)
      }
    })
    return map
  }, [splitGroups])

  const splitSelectedPages = useMemo<Set<number> | null>(() => {
    if (splitMode !== 'RANGES' || splitGroups.length === 0) return null
    return new Set(splitGroups.flat())
  }, [splitMode, splitGroups])

  const insertPreview = useMemo<{ count: number; error: string | null } | null>(() => {
    if (!insertDoc || insertDoc.status !== 'ready') return null
    if (!insertRanges.trim()) {
      return { count: insertDoc.pages, error: null }
    }
    const parsed = parseRanges(insertRanges, insertDoc.pages)
    if (parsed.error) return { count: 0, error: parsed.error }
    const count = parsed.groups.reduce((sum, group) => sum + group.length, 0)
    return { count, error: count === 0 ? '请填写要插入的页码' : null }
  }, [insertDoc, insertRanges])

  const insertSelectedPages = useMemo<Set<number> | null>(() => {
    if (!insertDoc || insertDoc.status !== 'ready' || !insertRanges.trim()) return null
    const parsed = parseRanges(insertRanges, insertDoc.pages)
    if (parsed.error || parsed.groups.length === 0) return null
    return new Set(parsed.groups.flat())
  }, [insertDoc, insertRanges])

  const insertMarkerBefore = useMemo<number | null>(() => {
    if (!baseDoc || baseDoc.status !== 'ready') return null
    if (positionMode === 'START') return 1
    if (positionMode === 'END') return baseDoc.pages + 1
    if (!Number.isInteger(positionPage) || positionPage < 1 || positionPage > baseDoc.pages) {
      return null
    }
    return positionPage
  }, [baseDoc, positionMode, positionPage])

  const positionValid =
    positionMode !== 'BEFORE' ||
    (Boolean(baseDoc) &&
      baseDoc?.status === 'ready' &&
      Number.isInteger(positionPage) &&
      positionPage >= 1 &&
      positionPage <= baseDoc.pages)

  const canStartSplit =
    !running &&
    splitDoc?.status === 'ready' &&
    Boolean(outputDir) &&
    Boolean(splitPreview) &&
    !splitPreview?.error &&
    (splitPreview?.count ?? 0) > 0
  const canStartInsert =
    !running &&
    baseDoc?.status === 'ready' &&
    insertDoc?.status === 'ready' &&
    Boolean(insertOutput) &&
    Boolean(insertPreview) &&
    !insertPreview?.error &&
    (insertPreview?.count ?? 0) > 0 &&
    positionValid

  const startSplitJob = async () => {
    if (runningRef.current) return
    if (!splitDoc || splitDoc.status !== 'ready') {
      setError('请先选择要拆分的文档')
      return
    }
    if (splitPreview?.error) {
      setError(splitPreview.error)
      return
    }
    if (!outputDir) {
      setError('请选择输出目录')
      return
    }
    if (splitMode === 'CHUNK') {
      const size = Number(pagesPerFile)
      if (!Number.isInteger(size) || size < 1 || size > MAX_PAGES_PER_FILE) {
        setError(`每组页数应为 1-${MAX_PAGES_PER_FILE}`)
        return
      }
    }
    if (splitMode === 'RANGES' && !ranges.trim()) {
      setError('请填写页码范围')
      return
    }
    setError(null)
    setNotice(null)
    setJob(null)
    try {
      const initial = await startSplit(backend, {
        sourcePath: splitDoc.path,
        mode: splitMode,
        pagesPerFile: splitMode === 'CHUNK' ? Number(pagesPerFile) : undefined,
        ranges: splitMode === 'RANGES' ? ranges : undefined,
        outputDir,
        baseName: baseNameInput.trim() || undefined
      })
      await runJob(initial)
    } catch (reason) {
      setError(messageOf(reason))
    }
  }

  const startInsertJob = async () => {
    if (runningRef.current) return
    if (!baseDoc || baseDoc.status !== 'ready') {
      setError('请先选择主文档')
      return
    }
    if (!insertDoc || insertDoc.status !== 'ready') {
      setError('请先选择插入文档')
      return
    }
    if (!insertOutput) {
      setError('请选择保存位置')
      return
    }
    if (insertPreview?.error) {
      setError(insertPreview.error)
      return
    }
    if (!positionValid) {
      setError(`插入位置应在 1-${baseDoc.pages} 页之间`)
      return
    }
    setError(null)
    setNotice(null)
    setJob(null)
    try {
      const initial = await startInsert(backend, {
        basePath: baseDoc.path,
        insertPath: insertDoc.path,
        insertRanges: insertRanges.trim() || undefined,
        positionMode,
        position: positionMode === 'BEFORE' ? positionPage : undefined,
        outputPath: insertOutput,
        overwrite: true
      })
      await runJob(initial)
    } catch (reason) {
      setError(messageOf(reason))
    }
  }

  const activeJob = job && (job.status === 'QUEUED' || job.status === 'RUNNING') ? job : null
  const result = job?.status === 'SUCCEEDED' ? job : null
  const elapsed =
    running && startedAtRef.current ? formatElapsed(now - startedAtRef.current) : ''

  return (
    <div className="page-tools">
      <div className="batch-toolbar">
        <div className="page-mode-switch" role="tablist" aria-label="拆分或插页">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'split'}
            className={`page-mode-btn ${mode === 'split' ? 'active' : ''}`}
            data-action="page-mode-split"
            onClick={() => changeMode('split')}
            disabled={running}
          >
            <IconPages size={16} />
            拆分文档
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'insert'}
            className={`page-mode-btn ${mode === 'insert' ? 'active' : ''}`}
            data-action="page-mode-insert"
            onClick={() => changeMode('insert')}
            disabled={running}
          >
            <IconPlus size={16} />
            插入页面
          </button>
        </div>
        <div className="batch-toolbar-actions">
          {running ? (
            <button className="btn ghost" data-action="pages-stop" onClick={stop} disabled={stopping}>
              {stopping ? '正在停止…' : '停止'}
            </button>
          ) : null}
          {mode === 'split' ? (
            <button
              className="btn primary"
              data-action="split-start"
              onClick={() => void startSplitJob()}
              disabled={!canStartSplit}
            >
              {running ? <span className="btn-spinner" /> : <IconPages size={16} />}
              {running ? '拆分中' : '开始拆分'}
            </button>
          ) : (
            <button
              className="btn primary"
              data-action="insert-start"
              onClick={() => void startInsertJob()}
              disabled={!canStartInsert}
            >
              {running ? <span className="btn-spinner" /> : <IconPlus size={16} />}
              {running ? '插入中' : '开始插入'}
            </button>
          )}
        </div>
      </div>

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
        <div className="merge-progress" data-pages-progress={activeJob.progress}>
          <div className="batch-phase">
            {activeJob.phase}
            {elapsed ? ` · 已用 ${elapsed}` : ''}
          </div>
          <div className="batch-bar">
            <span style={{ width: `${Math.max(3, activeJob.progress)}%` }} />
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="merge-result" data-page-result="done">
          <div className="merge-result-head">
            <span className="merge-result-icon">
              <IconSpark size={18} />
            </span>
            <div className="merge-result-text">
              <strong>{result.operation === 'SPLIT' ? '拆分完成' : '插入完成'}</strong>
              <span>
                {result.operation === 'SPLIT'
                  ? `${result.outputFiles} 个文件 · ${result.outputPages} 页`
                  : `${result.outputName ?? ''} · ${result.outputPages} 页`}
                {` · ${formatSize(result.outputBytes)}`}
                {jobDuration(result) ? ` · ${jobDuration(result)}` : ''}
              </span>
            </div>
            <div className="merge-result-actions">
              {result.outputs[0] ? (
                <button
                  className="btn ghost small"
                  data-action="page-view-result"
                  onClick={() => onOpenDocument(result.outputs[0].path)}
                >
                  <IconView size={14} />
                  查看
                </button>
              ) : null}
              {result.outputs[0] ? (
                <button
                  className="btn ghost small"
                  data-action="page-print-result"
                  onClick={() => onPrintResult(result.outputs[0].path)}
                >
                  <IconPrint size={14} />
                  打印
                </button>
              ) : null}
              {result.outputDir || result.outputs[0] ? (
                <button
                  className="icon-btn"
                  data-action="page-reveal-result"
                  onClick={() =>
                    void window.adou.revealPath(result.outputDir ?? result.outputs[0].path)
                  }
                  title="在文件夹中显示"
                >
                  <IconLocation size={14} />
                </button>
              ) : null}
            </div>
          </div>

          {result.warnings.length > 0 ? (
            <ul className="merge-warnings">
              {result.warnings.map((warning) => (
                <li key={warning}>
                  <IconInfo size={13} />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {result.operation === 'SPLIT' && result.outputs.length > 0 ? (
            <div className="page-output-list">
              {result.outputs.map((output, index) => (
                <div className="page-output-row" key={output.path} data-page-output={index}>
                  <span className={`format-badge ${output.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'ofd'}`}>
                    {output.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'OFD'}
                  </span>
                  <span className="page-output-name" title={output.path}>{output.name}</span>
                  <span className="page-output-pages">{output.pages} 页</span>
                  <div className="page-output-actions">
                    <button
                      className="btn ghost small"
                      data-action="page-view-output"
                      onClick={() => onOpenDocument(output.path)}
                    >
                      <IconView size={13} />
                      查看
                    </button>
                    <button
                      className="btn ghost small"
                      data-action="page-print-output"
                      onClick={() => onPrintResult(output.path)}
                    >
                      <IconPrint size={13} />
                      打印
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => void window.adou.revealPath(output.path)}
                      title="在文件夹中显示"
                    >
                      <IconLocation size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'split' ? (
        <>
          <FileSlot
            title="待拆分文档"
            hint="支持 .ofd / .pdf；按页、每 N 页或页面区间拆成多个文件。"
            doc={splitDoc}
            large={!splitDoc}
            disabled={running}
            pickAction="split-pick-source"
            clearAction="split-clear-source"
            onPick={() => void pickInto(splitSeq, setSplitDoc)}
            onDropPath={(path) => void loadDoc(path, splitSeq, setSplitDoc)}
            onClear={clearSplit}
          />

          {splitDoc && splitDoc.status === 'ready' ? (
            <div className="page-card">
              <div className="page-card-head">
                <strong>拆分方式</strong>
                <span>源文件只读，同名结果自动加序号，不覆盖已有文件。</span>
              </div>
              <div className="page-choices">
                <button
                  type="button"
                  className={`page-choice ${splitMode === 'PAGE' ? 'active' : ''}`}
                  data-action="split-mode-page"
                  onClick={() => {
                    setSplitMode('PAGE')
                    resetResult()
                  }}
                  disabled={running}
                >
                  <strong>每页一份</strong>
                  <small>每个页面单独保存为一个文件</small>
                </button>
                <button
                  type="button"
                  className={`page-choice ${splitMode === 'CHUNK' ? 'active' : ''}`}
                  data-action="split-mode-chunk"
                  onClick={() => {
                    setSplitMode('CHUNK')
                    resetResult()
                  }}
                  disabled={running}
                >
                  <strong>每 N 页一份</strong>
                  <small>按固定页数分组保存</small>
                </button>
                <button
                  type="button"
                  className={`page-choice ${splitMode === 'RANGES' ? 'active' : ''}`}
                  data-action="split-mode-ranges"
                  onClick={() => {
                    setSplitMode('RANGES')
                    resetResult()
                  }}
                  disabled={running}
                >
                  <strong>按页码范围</strong>
                  <small>逗号分隔，每段输出一个文件</small>
                </button>
              </div>

              <div className={`page-options ${splitMode === 'CHUNK' ? 'page-options-chunk' : ''}`}>
                {splitMode === 'CHUNK' ? (
                  <label className="page-field">
                    <span>每组页数</span>
                    <span className="page-number-line">
                      <input
                        className="page-tool-input page-tool-number"
                        data-action="split-pages-per-file"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_PAGES_PER_FILE}
                        value={pagesPerFile}
                        onChange={(event) => {
                          setPagesPerFile(event.target.value)
                          resetResult()
                        }}
                        disabled={running}
                      />
                      <span className="page-number-suffix">页</span>
                    </span>
                  </label>
                ) : null}
                {splitMode === 'RANGES' ? (
                  <label className="page-field page-field-wide">
                    <span>页码范围</span>
                    <input
                      className="page-tool-input"
                      data-action="split-ranges"
                      type="text"
                      placeholder="例如 1-3,5,7-9"
                      value={ranges}
                      onChange={(event) => {
                        setRanges(event.target.value)
                        resetResult()
                      }}
                      disabled={running}
                    />
                    <small>逗号分隔，每段输出一个文件；组内可用空格追加页码，如 1-3 5。</small>
                  </label>
                ) : null}
                <label
                  className={`page-field ${splitMode === 'PAGE' ? 'page-field-wide' : ''}`}
                >
                  <span>文件名前缀</span>
                  <input
                    className="page-tool-input"
                    data-action="split-base-name"
                    type="text"
                    maxLength={80}
                    value={baseNameInput}
                    onChange={(event) => {
                      setBaseNameInput(event.target.value)
                      resetResult()
                    }}
                    disabled={running}
                  />
                </label>
              </div>

              <div className="page-output-line">
                <button
                  className="btn ghost"
                  data-action="split-output-dir"
                  onClick={() => void pickSplitDir()}
                  disabled={running}
                >
                  <IconFolder size={16} />
                  {outputDir ? '更换输出目录' : '选择输出目录'}
                </button>
                <span className={`merge-output-path ${outputDir ? '' : 'is-empty'}`} title={outputDir}>
                  {outputDir || '尚未选择输出目录'}
                </span>
              </div>

              {splitPreview?.error ? (
                <div className="page-hint error">{splitPreview.error}</div>
              ) : splitPreview ? (
                <div className="batch-summary">
                  <span>预计生成 {splitPreview.count} 个文件</span>
                  <span className="dot" />
                  <span>共 {splitPreview.pages} 页</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {splitDoc ? (
            <PagePreviewPanel
              backend={backend}
              title="页面预览"
              hint={
                splitMode === 'PAGE'
                  ? '每页一份'
                  : splitGroups.length > 0
                    ? `按颜色标记 ${splitGroups.length} 个输出文件`
                    : '调整拆分方式后更新预览'
              }
              state={splitPagePreview}
              loading={splitDoc.status === 'probing'}
              selectedPages={splitSelectedPages}
              groupByPage={splitMode !== 'PAGE' ? splitGroupByPage : null}
              emptyText="选择文件后显示页面预览"
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="page-slots">
            <FileSlot
              title="主文档"
              hint="插入页面后仍以这个文档为主体。"
              doc={baseDoc}
              disabled={running}
              pickAction="insert-pick-base"
              clearAction="insert-clear-base"
              onPick={() => void pickInto(baseSeq, setBaseDoc)}
              onDropPath={(path) => void loadDoc(path, baseSeq, setBaseDoc)}
              onClear={() => {
                if (running) return
                setBaseDoc(null)
                setInsertOutput('')
                resetResult()
              }}
            />
            <FileSlot
              title="插入文档"
              hint="从这个 OFD / PDF 选择页面插入到主文档。"
              doc={insertDoc}
              disabled={running}
              pickAction="insert-pick-source"
              clearAction="insert-clear-source"
              onPick={() => void pickInto(insertSeq, setInsertDoc)}
              onDropPath={(path) => void loadDoc(path, insertSeq, setInsertDoc)}
              onClear={() => {
                if (running) return
                setInsertDoc(null)
                resetResult()
              }}
            />
          </div>

          <div className="page-card">
            <div className="page-card-head">
              <strong>插入设置</strong>
              <span>
                插入文档与主文档格式不同时会先转换插入页；输出格式跟随主文档。
              </span>
              {!running && (baseDoc || insertDoc) ? (
                <button className="batch-link" onClick={clearInsert}>清空</button>
              ) : null}
            </div>
            <div className="page-options">
              <label className="page-field">
                <span>插入页面</span>
                <input
                  className="page-tool-input"
                  data-action="insert-ranges"
                  type="text"
                  placeholder="留空表示全部页面，例如 1-3,5"
                  value={insertRanges}
                  onChange={(event) => {
                    setInsertRanges(event.target.value)
                    resetResult()
                  }}
                  disabled={running}
                />
                <small>
                  {insertPreview?.error
                    ? insertPreview.error
                    : insertPreview
                      ? `将插入 ${insertPreview.count} 页`
                      : '选择插入文档后可指定页码'}
                </small>
              </label>
              <div className="page-field">
                <span>插入位置</span>
                <div className="page-choice-row">
                  {(
                    [
                      ['START', '文档开头'],
                      ['BEFORE', '指定页前'],
                      ['END', '文档末尾']
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`page-position-btn ${positionMode === value ? 'active' : ''}`}
                      data-action={`insert-position-${value.toLowerCase()}`}
                      onClick={() => {
                        setPositionMode(value)
                        resetResult()
                      }}
                      disabled={running}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {positionMode === 'BEFORE' ? (
                  <span className="page-number-line">
                    <input
                      className="page-tool-input page-tool-number"
                      data-action="insert-position-page"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={baseDoc?.status === 'ready' ? baseDoc.pages : undefined}
                      value={positionPage}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setPositionPage(Number.isFinite(next) && next >= 1 ? next : 1)
                        resetResult()
                      }}
                      disabled={running}
                    />
                    <span className="page-number-suffix">页</span>
                  </span>
                ) : null}
                <small>
                  {baseDoc?.status === 'ready'
                    ? positionMode === 'BEFORE'
                      ? `插入到主文档第 ${positionPage} 页之前`
                      : positionMode === 'START'
                        ? '插入到主文档第 1 页之前'
                        : '插入到主文档最后一页之后'
                    : '选择主文档后可设置位置'}
                </small>
              </div>
            </div>

            <div className="page-output-line">
              <button
                className="btn ghost"
                data-action="insert-output"
                onClick={() => void pickInsertOutput()}
                disabled={running || baseDoc?.status !== 'ready'}
              >
                <IconFile size={16} />
                {insertOutput ? '更换保存位置' : '选择保存位置'}
              </button>
              <span className={`merge-output-path ${insertOutput ? '' : 'is-empty'}`} title={insertOutput}>
                {insertOutput || '尚未选择保存位置'}
              </span>
            </div>

            <div className="batch-summary">
              <span>
                主文档 {baseDoc?.status === 'ready' ? `${baseDoc.pages} 页` : '未选择'}
              </span>
              <span className="dot" />
              <span>
                插入 {insertPreview ? `${insertPreview.count} 页` : '未选择'}
              </span>
              {baseDoc?.status === 'ready' && insertPreview && !insertPreview.error ? (
                <>
                  <span className="dot" />
                  <span>结果共 {baseDoc.pages + insertPreview.count} 页</span>
                </>
              ) : null}
            </div>
          </div>

          {baseDoc || insertDoc ? (
            <div className="page-previews">
              <PagePreviewPanel
                backend={backend}
                title="主文档预览"
                hint={insertMarkerBefore ? '虚线处为插入位置' : undefined}
                state={basePagePreview}
                loading={baseDoc?.status === 'probing'}
                insertMarkerBefore={insertMarkerBefore}
                emptyText="选择主文档后显示页面预览"
              />
              <PagePreviewPanel
                backend={backend}
                title="插入文档预览"
                hint={
                  insertPreview && !insertPreview.error
                    ? `将插入 ${insertPreview.count} 页`
                    : undefined
                }
                state={insertPagePreview}
                loading={insertDoc?.status === 'probing'}
                selectedPages={insertSelectedPages}
                emptyText="选择插入文档后显示页面预览"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

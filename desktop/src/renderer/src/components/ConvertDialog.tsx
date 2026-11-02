import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendInfo, ConversionJob, DocumentSummary } from '@shared/types'
import { cancelConversion, fetchConversion, messageOf, startConversion } from '../api'
import { IconAlert, IconClose, IconFolder, IconInfo, IconPrint, IconSwap } from './icons'

const POLL_INTERVAL = 400
const STALL_TIMEOUT_MS = 180_000

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`
  return `${(ms / 1000).toFixed(1)} 秒`
}

interface ConvertDialogProps {
  open: boolean
  backend: BackendInfo
  doc: DocumentSummary
  onClose: () => void
  onOpenOutput: (path: string) => void
  onPrintOutput: (path: string) => void
}

export function ConvertDialog({
  open,
  backend,
  doc,
  onClose,
  onOpenOutput,
  onPrintOutput
}: ConvertDialogProps) {
  const target = doc.kind === 'PDF' ? 'OFD' : 'PDF'
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [job, setJob] = useState<ConversionJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stalled, setStalled] = useState(false)
  const lastChangeRef = useRef({ progress: -1, at: Date.now() })

  const jobId = job?.id ?? null
  const running = !stalled && (job?.status === 'QUEUED' || job?.status === 'RUNNING')

  useEffect(() => {
    if (!open) return
    setOutputPath(null)
    setJob(null)
    setError(null)
    setBusy(false)
    setStalled(false)
    lastChangeRef.current = { progress: -1, at: Date.now() }
  }, [open, doc.id])

  useEffect(() => {
    if (!open || !jobId || !running) return
    let alive = true
    const timer = window.setInterval(() => {
      void fetchConversion(backend, jobId)
        .then((next) => {
          if (!alive) return
          if (next.progress !== lastChangeRef.current.progress) {
            lastChangeRef.current = { progress: next.progress, at: Date.now() }
          } else if (Date.now() - lastChangeRef.current.at > STALL_TIMEOUT_MS) {
            setStalled(true)
            setError('转换长时间没有进展，已停止等待；可重试或拆分文档后再转换')
            void cancelConversion(backend, jobId).catch(() => undefined)
            return
          }
          setJob(next)
        })
        .catch((reason: unknown) => {
          if (alive) setError(messageOf(reason))
        })
    }, POLL_INTERVAL)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [backend, jobId, running, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !running) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, running, onClose])

  const pickOutput = useCallback(async (): Promise<string | null> => {
    const picked = await window.adou.pickConversionTarget({ sourcePath: doc.path, target })
    if (picked) {
      setOutputPath(picked)
      setError(null)
    }
    return picked
  }, [doc.path, target])

  const start = useCallback(async () => {
    setError(null)
    let path = outputPath
    if (!path) {
      path = await pickOutput()
      if (!path) return
    }
    setBusy(true)
    try {
      const created = await startConversion(backend, {
        documentId: doc.id,
        target,
        outputPath: path,
        overwrite: true
      })
      setOutputPath(created.outputPath)
      setJob(created)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }, [backend, doc.id, outputPath, pickOutput, target])

  const cancel = useCallback(async () => {
    if (!job) return
    try {
      setJob(await cancelConversion(backend, job.id))
    } catch (reason) {
      setError(messageOf(reason))
    }
  }, [backend, job])

  if (!open) return null

  const succeeded = job?.status === 'SUCCEEDED' && job.report != null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !running) onClose()
      }}
    >
      <div className="convert-dialog" role="dialog" aria-modal="true" aria-labelledby="convert-title">
        <button className="about-close" onClick={onClose} disabled={running} aria-label="关闭转换">
          <IconClose size={16} />
        </button>

        <header className="convert-head">
          <h2 id="convert-title">格式转换</h2>
          <p>转换在本机引擎完成，文件不上传、不联网；原文件只读。</p>
        </header>

        <div className="convert-flow">
          <div className="convert-card">
            <span className="convert-label">源文件</span>
            <span className="convert-name" title={doc.name}>{doc.name}</span>
            <span className="convert-meta">
              {doc.kind} · {doc.pageCount} 页 · {formatSize(doc.size)}
            </span>
          </div>
          <div className="convert-arrow" aria-hidden="true">
            <IconSwap size={16} />
          </div>
          <div className="convert-card target">
            <span className="convert-label">输出格式</span>
            <span className="convert-name">{target}</span>
            <span className="convert-meta">
              {target === 'PDF' ? '保留可复制文字与页面尺寸' : '按页生成标准 OFD 版式'}
            </span>
          </div>
        </div>

        <div className="convert-output">
          <span className="convert-label">保存到</span>
          <div className="convert-output-row">
            <span className={`convert-path ${outputPath ? '' : 'is-empty'}`} title={outputPath ?? ''}>
              {outputPath ?? '尚未选择保存位置'}
            </span>
            <button
              className="btn ghost small"
              onClick={() => void pickOutput()}
              disabled={running || busy}
            >
              <IconFolder size={14} />
              选择位置
            </button>
          </div>
        </div>

        {running && job ? (
          <div className="convert-progress">
            <div className="convert-progress-head">
              <span>{job.phase}</span>
              <b>{job.progress}%</b>
            </div>
            <div
              className="convert-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.progress}
            >
              <span style={{ width: `${Math.max(3, job.progress)}%` }} />
            </div>
          </div>
        ) : null}

        {succeeded && job?.report ? (
          <div className="convert-result">
            <div className="convert-result-grid">
              <div><span>页数</span><b>{job.report.outputPages}</b></div>
              <div><span>体积</span><b>{formatSize(job.report.outputBytes)}</b></div>
              <div><span>耗时</span><b>{formatDuration(job.report.durationMs)}</b></div>
            </div>
            {job.report.warnings.map((warning) => (
              <p className="convert-warning" key={warning}>
                <IconInfo size={14} />
                {warning}
              </p>
            ))}
            <p className="convert-saved" title={job.outputPath}>{job.outputPath}</p>
          </div>
        ) : null}

        {job?.status === 'CANCELED' ? (
          <p className="convert-note">已取消转换，未生成文件。</p>
        ) : null}

        {job?.status === 'FAILED' ? (
          <div className="convert-error" role="alert">
            <IconAlert size={16} />
            <span>{job.errorMessage ?? '转换失败，请重试'}</span>
          </div>
        ) : null}

        {error ? (
          <div className="convert-error" role="alert">
            <IconAlert size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="convert-actions">
          {succeeded && job ? (
            <>
              <button className="btn primary" onClick={() => onOpenOutput(job.outputPath)}>
                打开结果
              </button>
              <button
                className="btn ghost"
                data-action="print-output"
                onClick={() => onPrintOutput(job.outputPath)}
              >
                <IconPrint size={15} />
                打印
              </button>
              <button
                className="btn ghost"
                onClick={() => void window.adou.revealPath(job.outputPath)}
              >
                在文件夹中显示
              </button>
              <button className="btn ghost" onClick={onClose}>关闭</button>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={() => void start()} disabled={running || busy}>
                {busy ? <span className="btn-spinner" /> : <IconSwap size={15} />}
                {job?.status === 'FAILED' ? '重新转换' : '开始转换'}
              </button>
              {running ? (
                <button className="btn ghost" onClick={() => void cancel()}>取消转换</button>
              ) : (
                <button className="btn ghost" onClick={onClose}>关闭</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

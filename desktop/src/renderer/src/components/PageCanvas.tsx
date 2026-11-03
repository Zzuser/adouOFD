import { useEffect, useMemo, useRef, useState } from 'react'
import type { BackendInfo, TextRun } from '@shared/types'
import { isQuarterTurn, type PageRotation } from '@shared/rotation'
import { fetchPageText, pageImageUrl } from '../api'

export interface SearchHighlight {
  start: number
  end: number
  active?: boolean
}

interface PageCanvasProps {
  backend: BackendInfo
  docId: string
  page: number
  dpi: number
  width: number
  height: number
  rotation: PageRotation
  shouldRender: boolean
  ready: boolean
  highlights?: SearchHighlight[]
  registerRef: (element: HTMLDivElement | null) => void
  onLoaded?: () => void
}

interface RunSegment {
  text: string
  hit: boolean
  active: boolean
}

function splitRun(
  text: string,
  runStart: number,
  highlights: SearchHighlight[] | undefined
): RunSegment[] | null {
  if (!highlights || highlights.length === 0) return null
  const runEnd = runStart + text.length
  const segments: RunSegment[] = []
  let cursor = 0
  for (const highlight of highlights) {
    if (highlight.end <= runStart) continue
    if (highlight.start >= runEnd) break
    const from = Math.max(cursor, Math.max(0, highlight.start - runStart))
    const to = Math.min(text.length, highlight.end - runStart)
    if (to <= from) continue
    if (from > cursor) {
      segments.push({ text: text.slice(cursor, from), hit: false, active: false })
    }
    segments.push({ text: text.slice(from, to), hit: true, active: Boolean(highlight.active) })
    cursor = to
    if (cursor >= text.length) break
  }
  if (segments.length === 0) return null
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), hit: false, active: false })
  }
  return segments
}

export function PageCanvas({
  backend,
  docId,
  page,
  dpi,
  width,
  height,
  rotation,
  shouldRender,
  ready,
  highlights,
  registerRef,
  onLoaded
}: PageCanvasProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [textRuns, setTextRuns] = useState<TextRun[]>([])
  const imgRef = useRef<HTMLImageElement>(null)

  const canLoad =
    shouldRender &&
    ready &&
    backend.status === 'ready' &&
    Boolean(backend.port) &&
    Boolean(backend.token)
  const quarterTurn = isQuarterTurn(rotation)
  const sheetWidth = quarterTurn ? height : width
  const sheetHeight = quarterTurn ? width : height
  const src = canLoad
    ? `${pageImageUrl(backend, docId, page, dpi, rotation)}&r=${attempt}`
    : null

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    // 缩放后同一图片常直接命中 HTTP 缓存，此时 onLoad 可能不会再触发。
    const settle = (): void => {
      const image = imgRef.current
      if (!image || !image.complete) return
      if (image.naturalWidth > 0) {
        setLoaded(true)
      } else {
        setFailed(true)
      }
    }
    settle()
    const frame = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(frame)
  }, [src])

  useEffect(() => {
    if (loaded) onLoaded?.()
  }, [loaded, onLoaded])

  useEffect(() => {
    setTextRuns([])
    if (
      !shouldRender ||
      !ready ||
      backend.status !== 'ready' ||
      !backend.port ||
      !backend.token
    ) {
      return
    }
    const controller = new AbortController()
    fetchPageText(backend, docId, page, controller.signal)
      .then((runs) => setTextRuns(runs))
      .catch(() => {
        // 无文本层或提取失败时不影响图片预览
      })
    return () => controller.abort()
  }, [backend, docId, page, ready, shouldRender])

  const renderedRuns = useMemo(() => {
    let offset = 0
    return textRuns.map((run, index) => {
      const runStart = offset
      offset += run.text.length
      return { run, index, segments: splitRun(run.text, runStart, highlights) }
    })
  }, [textRuns, highlights])

  return (
    <div className="page-slot" data-page={page} ref={registerRef}>
      <div className="page-number">第 {page} 页</div>
      <div className="page-sheet" style={{ width: sheetWidth, height: sheetHeight }}>
        {src ? (
          <img
            key={src}
            ref={imgRef}
            className={`page-img ${loaded ? 'loaded' : ''}`}
            src={src}
            alt={`文档第 ${page} 页`}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(true)
              setFailed(true)
            }}
          />
        ) : null}

        {loaded && !failed && renderedRuns.length > 0 ? (
          <div
            className="page-rotor"
            style={{
              width,
              height,
              left: (sheetWidth - width) / 2,
              top: (sheetHeight - height) / 2,
              transform: rotation ? `rotate(${rotation}deg)` : undefined
            }}
          >
            <div className="text-layer" aria-label={`第 ${page} 页可选择文本`}>
              {renderedRuns.map(({ run, index, segments }) => (
                <span
                  key={`${index}-${run.text.slice(0, 12)}`}
                  className="text-run"
                  style={{
                    left: `${run.x * 100}%`,
                    top: `${run.y * 100}%`,
                    width: `${Math.max(0.5, run.width * 100)}%`,
                    height: `${Math.max(0.5, run.height * 100)}%`,
                    fontSize: `${Math.max(3, run.fontSize * height)}px`,
                    lineHeight: 1
                  }}
                >
                  {segments
                    ? segments.map((segment, segmentIndex) =>
                        segment.hit ? (
                          <mark
                            key={segmentIndex}
                            className={`search-hit ${segment.active ? 'active' : ''}`}
                          >
                            {segment.text}
                          </mark>
                        ) : (
                          segment.text
                        )
                      )
                    : run.text}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {!src ? (
          <div className="page-placeholder">
            <span>{page}</span>
          </div>
        ) : null}

        {src && !loaded && !failed ? (
          <div className="page-loading">
            <span className="spinner" />
            <span>渲染中…</span>
          </div>
        ) : null}

        {failed ? (
          <div className="page-error">
            <span>第 {page} 页渲染失败</span>
            <button onClick={() => setAttempt((value) => value + 1)}>重试</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

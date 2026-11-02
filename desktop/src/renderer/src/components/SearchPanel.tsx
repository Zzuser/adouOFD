import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendInfo, SearchHit, SearchJob } from '@shared/types'
import { cancelSearch, fetchSearch, messageOf, startSearch } from '../api'
import { IconChevronDown, IconChevronUp, IconClose, IconSearch } from './icons'

interface SearchPanelProps {
  backend: BackendInfo
  docId: string
  open: boolean
  onClose: () => void
  onNavigate: (hit: SearchHit) => void
  onHitsChange: (hits: SearchHit[], active: SearchHit | null) => void
}

const EMPTY_HITS: SearchHit[] = []

export function SearchPanel({
  backend,
  docId,
  open,
  onClose,
  onNavigate,
  onHitsChange
}: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [job, setJob] = useState<SearchJob | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const navigatedJobRef = useRef<string | null>(null)

  const hits = job?.hits ?? EMPTY_HITS
  const running = job?.status === 'RUNNING'
  const trimmedQuery = query.trim()

  useEffect(() => {
    setQuery('')
    setJob(null)
    setActiveIndex(-1)
    setError(null)
    navigatedJobRef.current = null
  }, [docId])

  useEffect(() => {
    if (!open) {
      setJob(null)
      setActiveIndex(-1)
      setError(null)
      navigatedJobRef.current = null
      return
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!trimmedQuery) {
      setJob(null)
      setActiveIndex(-1)
      setError(null)
      navigatedJobRef.current = null
      return
    }
    let alive = true
    let jobId: string | null = null
    let timer: number | null = null
    setJob(null)
    setActiveIndex(-1)
    setError(null)
    navigatedJobRef.current = null

    const clearTimer = (): void => {
      if (timer != null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const poll = async (id: string): Promise<void> => {
      try {
        const next = await fetchSearch(backend, docId, id)
        if (!alive) return
        setJob(next)
        if (next.status === 'RUNNING') {
          timer = window.setTimeout(() => void poll(id), 250)
        }
      } catch (reason) {
        if (alive) setError(messageOf(reason))
      }
    }

    const start = async (): Promise<void> => {
      try {
        const started = await startSearch(backend, docId, trimmedQuery, caseSensitive)
        if (!alive) {
          void cancelSearch(backend, docId, started.id).catch(() => undefined)
          return
        }
        jobId = started.id
        setError(null)
        setJob(started)
        timer = window.setTimeout(() => void poll(started.id), 150)
      } catch (reason) {
        if (alive) setError(messageOf(reason))
      }
    }

    timer = window.setTimeout(() => void start(), 300)
    return () => {
      alive = false
      clearTimer()
      if (jobId) void cancelSearch(backend, docId, jobId).catch(() => undefined)
    }
  }, [open, trimmedQuery, caseSensitive, backend, docId])

  useEffect(() => {
    if (!job || job.hits.length === 0) return
    if (navigatedJobRef.current === job.id) return
    navigatedJobRef.current = job.id
    setActiveIndex(0)
    onNavigate(job.hits[0])
  }, [job, onNavigate])

  useEffect(() => {
    const active = activeIndex >= 0 ? hits[activeIndex] ?? null : null
    onHitsChange(hits, active)
  }, [hits, activeIndex, onHitsChange])

  useEffect(() => {
    if (activeIndex >= 0) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, hits.length])

  const step = useCallback(
    (delta: number) => {
      if (hits.length === 0) return
      const base = activeIndex < 0 ? (delta > 0 ? -1 : 0) : activeIndex
      const next = (base + delta + hits.length) % hits.length
      setActiveIndex(next)
      onNavigate(hits[next])
    },
    [hits, activeIndex, onNavigate]
  )

  const select = useCallback(
    (index: number) => {
      const hit = hits[index]
      if (!hit) return
      setActiveIndex(index)
      onNavigate(hit)
    },
    [hits, onNavigate]
  )

  if (!open) return null

  const failed = job?.status === 'FAILED'
  let statusText = ''
  if (error) {
    statusText = error
  } else if (!trimmedQuery) {
    statusText = '输入关键词，在当前文档中查找'
  } else if (running) {
    statusText = `正在搜索 ${job?.scannedPages ?? 0}/${job?.totalPages ?? 0} 页`
  } else if (failed) {
    statusText = job?.errorMessage ?? '搜索失败'
  } else if (job?.status === 'CANCELED') {
    statusText = '搜索已取消'
  } else if (job) {
    statusText = `找到 ${job.matchCount} 处${
      job.truncated ? `（仅显示前 ${job.hits.length} 条）` : ''
    }${job.failedPages > 0 ? ` · ${job.failedPages} 页文本读取失败` : ''}`
  }

  const showResults =
    Boolean(trimmedQuery) &&
    (hits.length > 0 || Boolean(error) || failed || job?.status === 'SUCCEEDED')

  return (
    <div className="search-bar" role="search">
      <div className="search-field">
        <IconSearch size={15} />
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          placeholder="在当前文档中搜索"
          aria-label="搜索当前文档"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              step(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
        {query ? (
          <button
            className="search-clear"
            aria-label="清空搜索"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <IconClose size={12} />
          </button>
        ) : null}
      </div>

      <span className={`search-status ${error || failed ? 'error' : ''}`}>
        {running ? <span className="spinner search-spinner" /> : null}
        {statusText}
      </span>

      <div className="search-actions">
        <span className="search-index">
          {activeIndex >= 0 && hits.length > 0 ? `${activeIndex + 1}/${hits.length}` : ''}
        </span>
        <button
          className="search-btn"
          data-action="search-prev"
          onClick={() => step(-1)}
          disabled={hits.length === 0}
          title="上一处（Shift + Enter）"
          aria-label="上一处"
        >
          <IconChevronUp size={15} />
        </button>
        <button
          className="search-btn"
          data-action="search-next"
          onClick={() => step(1)}
          disabled={hits.length === 0}
          title="下一处（Enter）"
          aria-label="下一处"
        >
          <IconChevronDown size={15} />
        </button>
        <button
          className={`search-case ${caseSensitive ? 'active' : ''}`}
          data-action="search-case"
          onClick={() => setCaseSensitive((value) => !value)}
          aria-pressed={caseSensitive}
          title="区分大小写"
        >
          Aa
        </button>
        <button
          className="search-btn"
          data-action="search-close"
          onClick={onClose}
          title="关闭搜索（Esc）"
          aria-label="关闭搜索"
        >
          <IconClose size={15} />
        </button>
      </div>

      {showResults ? (
        <div className="search-results" role="listbox" aria-label="搜索结果">
          {hits.map((hit, index) => (
            <button
              key={`${hit.page}-${hit.start}-${index}`}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              className={`search-row ${index === activeIndex ? 'active' : ''}`}
              data-search-row={index}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => select(index)}
            >
              <span className="search-row-page">第 {hit.page} 页</span>
              <span className="search-row-text">
                {hit.beforeTruncated ? '…' : ''}
                {hit.before}
                <mark>{hit.match}</mark>
                {hit.after}
                {hit.afterTruncated ? '…' : ''}
              </span>
            </button>
          ))}
          {hits.length === 0 && job?.status === 'SUCCEEDED' ? (
            <div className="search-empty">
              未找到“{job.query}”
              {job.failedPages > 0 ? `，${job.failedPages} 页文本读取失败` : ''}
            </div>
          ) : null}
          {error ? <div className="search-empty">{error}</div> : null}
          {failed ? <div className="search-empty">{job?.errorMessage ?? '搜索失败'}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

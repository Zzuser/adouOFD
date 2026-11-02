import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackendInfo, DocumentSummary, OutlineItem, SearchHit } from '@shared/types'
import { fetchOutline, messageOf } from '../api'
import { DocumentNav, type NavTab } from './DocumentNav'
import { PageCanvas, type SearchHighlight } from './PageCanvas'
import { SearchPanel } from './SearchPanel'
import { ZoomMenu, type ZoomMode } from './ZoomMenu'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconFile,
  IconFitPage,
  IconFitWidth,
  IconLocation,
  IconMinus,
  IconPages,
  IconPlus,
  IconSearch,
  IconSwap
} from './icons'

const PX_PER_MM = 96 / 25.4
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_FACTOR = 1.25

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface ViewerProps {
  backend: BackendInfo
  doc: DocumentSummary
  active: boolean
  onClose: () => void
  onConvert: () => void
}

export function Viewer({ backend, doc, active, onClose, onConvert }: ViewerProps) {
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [zoom, setZoom] = useState(1)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [navOpen, setNavOpen] = useState(doc.pageCount > 1)
  const [navTab, setNavTab] = useState<NavTab>('thumbs')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [outlineError, setOutlineError] = useState<string | null>(null)
  const [firstPageReady, setFirstPageReady] = useState(false)
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set([1]))
  const [pageInput, setPageInput] = useState('1')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [activeSearchHit, setActiveSearchHit] = useState<SearchHit | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const pageInputRef = useRef<HTMLInputElement>(null)
  const anchorPageRef = useRef<number | null>(null)
  const currentPageRef = useRef(1)
  const effectiveZoomRef = useRef(1)
  const programmaticTargetRef = useRef<number | null>(null)
  const programmaticTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setZoomMode('fit-width')
    setZoom(1)
    setCurrentPage(1)
    currentPageRef.current = 1
    setPageInput('1')
    setRenderedPages(new Set([1]))
    setNavOpen(doc.pageCount > 1)
    setNavTab('thumbs')
    setOutline([])
    setOutlineLoading(false)
    setOutlineError(null)
    setFirstPageReady(false)
    setSearchOpen(false)
    setSearchHits([])
    setActiveSearchHit(null)
    anchorPageRef.current = null
    programmaticTargetRef.current = null
    if (programmaticTimerRef.current != null) {
      window.clearTimeout(programmaticTimerRef.current)
      programmaticTimerRef.current = null
    }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [doc.id, doc.pageCount])

  useEffect(() => {
    if (backend.status !== 'ready' || !backend.port || !backend.token) return
    let alive = true
    setOutlineLoading(true)
    setOutlineError(null)
    fetchOutline(backend, doc.id)
      .then((items) => {
        if (alive) setOutline(items)
      })
      .catch((error: unknown) => {
        if (alive) {
          setOutline([])
          setOutlineError(messageOf(error))
        }
      })
      .finally(() => {
        if (alive) setOutlineLoading(false)
      })
    return () => {
      alive = false
    }
  }, [backend, doc.id])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const update = (): void => {
      setContainerSize({ width: element.clientWidth, height: element.clientHeight })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [doc.id])

  const firstPage = doc.pages[0]
  const baseWidth = Math.max(1, (firstPage?.widthMm || 210) * PX_PER_MM)
  const baseHeight = Math.max(1, (firstPage?.heightMm || 297) * PX_PER_MM)

  const effectiveZoom = useMemo(() => {
    if (zoomMode === 'custom') {
      return clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    }
    const availableWidth = Math.max(180, containerSize.width - 60)
    const availableHeight = Math.max(180, containerSize.height - 96)
    const fitWidth = availableWidth / baseWidth
    const fitPage = Math.min(fitWidth, availableHeight / baseHeight)
    return clamp(zoomMode === 'fit-width' ? fitWidth : fitPage, MIN_ZOOM, MAX_ZOOM)
  }, [zoomMode, zoom, containerSize.width, containerSize.height, baseWidth, baseHeight])

  useEffect(() => {
    effectiveZoomRef.current = effectiveZoom
  }, [effectiveZoom])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  const renderDpi = clamp(
    Math.round(144 * (Math.ceil(effectiveZoom * 4) / 4)),
    96,
    300
  )

  const updateCurrentPage = useCallback(() => {
    if (programmaticTargetRef.current != null) return
    const root = scrollRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const marker = rootRect.top + rootRect.height * 0.38
    let next = 1
    const limit = Math.min(doc.pageCount, pageRefs.current.length)
    for (let index = 0; index < limit; index++) {
      const element = pageRefs.current[index]
      if (!element) continue
      if (element.getBoundingClientRect().top <= marker) {
        next = index + 1
      } else {
        break
      }
    }
    setCurrentPage((previous) => (previous === next ? previous : next))
  }, [doc.pageCount])

  const goToPage = useCallback(
    (page: number, smooth = true) => {
      const target = clamp(Math.round(page), 1, doc.pageCount)
      setRenderedPages((previous) => {
        if (previous.has(target)) return previous
        const next = new Set(previous)
        next.add(target)
        return next
      })
      setCurrentPage(target)
      currentPageRef.current = target

      programmaticTargetRef.current = target
      if (programmaticTimerRef.current != null) {
        window.clearTimeout(programmaticTimerRef.current)
      }
      programmaticTimerRef.current = window.setTimeout(() => {
        programmaticTargetRef.current = null
        programmaticTimerRef.current = null
        updateCurrentPage()
      }, 900)

      const root = scrollRef.current
      const element = pageRefs.current[target - 1]
      if (root && element) {
        const top =
          element.getBoundingClientRect().top -
          root.getBoundingClientRect().top +
          root.scrollTop -
          26
        root.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
      }
    },
    [doc.pageCount, updateCurrentPage]
  )

  const searchHighlights = useMemo(() => {
    const result = new Map<number, SearchHighlight[]>()
    for (const hit of searchHits) {
      const active =
        activeSearchHit !== null &&
        activeSearchHit.page === hit.page &&
        activeSearchHit.start === hit.start &&
        activeSearchHit.end === hit.end
      const list = result.get(hit.page)
      if (list) {
        list.push({ start: hit.start, end: hit.end, active })
      } else {
        result.set(hit.page, [{ start: hit.start, end: hit.end, active }])
      }
    }
    for (const list of result.values()) {
      list.sort((left, right) => left.start - right.start)
    }
    return result
  }, [searchHits, activeSearchHit])

  const handleSearchHits = useCallback((hits: SearchHit[], active: SearchHit | null) => {
    setSearchHits(hits)
    setActiveSearchHit(active)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchHits([])
    setActiveSearchHit(null)
  }, [])

  const focusSearchHit = useCallback(
    (hit: SearchHit) => {
      const page = clamp(hit.page, 1, doc.pageCount)
      setActiveSearchHit(hit)
      setRenderedPages((previous) => {
        if (previous.has(page)) return previous
        const next = new Set(previous)
        next.add(page)
        return next
      })
      goToPage(page, false)
      requestAnimationFrame(() => {
        const root = scrollRef.current
        const slot = pageRefs.current[page - 1]
        if (!root || !slot) return
        const sheet = slot.querySelector('.page-sheet') as HTMLElement | null
        const target = sheet ?? slot
        const rootRect = root.getBoundingClientRect()
        const rect = target.getBoundingClientRect()
        const top =
          root.scrollTop + (rect.top - rootRect.top) + hit.y * rect.height - rootRect.height * 0.32
        root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      })
    },
    [doc.pageCount, goToPage]
  )

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let frame = 0
    const onScroll = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        updateCurrentPage()
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [updateCurrentPage, doc.id, effectiveZoom])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const onScrollEnd = (): void => {
      if (programmaticTargetRef.current == null) return
      programmaticTargetRef.current = null
      if (programmaticTimerRef.current != null) {
        window.clearTimeout(programmaticTimerRef.current)
        programmaticTimerRef.current = null
      }
      updateCurrentPage()
    }
    root.addEventListener('scrollend', onScrollEnd)
    return () => root.removeEventListener('scrollend', onScrollEnd)
  }, [updateCurrentPage])

  useEffect(() => {
    return () => {
      if (programmaticTimerRef.current != null) {
        window.clearTimeout(programmaticTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.page))
          .filter((page) => Number.isFinite(page))
        if (visible.length === 0) return
        setRenderedPages((previous) => {
          let changed = false
          const next = new Set(previous)
          for (const page of visible) {
            if (!next.has(page)) {
              next.add(page)
              changed = true
            }
          }
          return changed ? next : previous
        })
      },
      { root, rootMargin: '900px 0px' }
    )
    for (const element of pageRefs.current) {
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [doc.id, doc.pageCount, navOpen])

  useEffect(() => {
    const target = anchorPageRef.current
    if (target == null) return
    anchorPageRef.current = null
    const frame = requestAnimationFrame(() => goToPage(target, false))
    return () => cancelAnimationFrame(frame)
  }, [effectiveZoom, goToPage])

  const zoomBy = useCallback((factor: number) => {
    const next = clamp(effectiveZoomRef.current * factor, MIN_ZOOM, MAX_ZOOM)
    if (Math.abs(next - effectiveZoomRef.current) < 0.0001) return
    effectiveZoomRef.current = next
    anchorPageRef.current = currentPageRef.current
    setZoomMode('custom')
    setZoom(next)
  }, [])

  const applyPreset = useCallback((scale: number) => {
    const next = clamp(scale, MIN_ZOOM, MAX_ZOOM)
    if (Math.abs(next - effectiveZoomRef.current) < 0.0001) return
    effectiveZoomRef.current = next
    anchorPageRef.current = currentPageRef.current
    setZoomMode('custom')
    setZoom(next)
  }, [])

  const applyFit = useCallback((mode: 'fit-width' | 'fit-page') => {
    anchorPageRef.current = currentPageRef.current
    setZoomMode(mode)
  }, [])

  const markFirstPageReady = useCallback(() => {
    setFirstPageReady(true)
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  useEffect(() => {
    if (!active) return
    const handler = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => {
          const pane = scrollRef.current?.closest('.viewer-pane')
          const input = pane?.querySelector<HTMLInputElement>('.search-input')
          input?.focus()
          input?.select()
        })
        return
      }
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault()
        zoomBy(ZOOM_FACTOR)
      } else if (mod && event.key === '-') {
        event.preventDefault()
        zoomBy(1 / ZOOM_FACTOR)
      } else if (mod && event.key === '0') {
        event.preventDefault()
        applyFit('fit-width')
      } else if (!mod && event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPage(currentPageRef.current - 1)
      } else if (!mod && event.key === 'ArrowRight') {
        event.preventDefault()
        goToPage(currentPageRef.current + 1)
      } else if (!mod && event.key === 'Escape' && searchOpen) {
        event.preventDefault()
        closeSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, zoomBy, applyFit, goToPage, searchOpen, closeSearch])

  useEffect(() => {
    if (document.activeElement !== pageInputRef.current) {
      setPageInput(String(currentPage))
    }
  }, [currentPage])

  useEffect(() => {
    if (!active) return
    type DragState = {
      page: HTMLElement
      anchorNode: Node
      anchorOffset: number
      focusNode: Node
      focusOffset: number
      pointerValid: boolean
      frame: number | null
    }
    let drag: DragState | null = null

    const caretRange = (x: number, y: number): Range | null => {
      const doc = document as Document & {
        caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
      }
      return doc.caretRangeFromPoint?.(x, y) ?? null
    }

    const textRunAt = (range: Range | null, page: HTMLElement): boolean => {
      if (!range) return false
      const node = range.startContainer
      const element = node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement
      const run = element?.closest('.text-run')
      return Boolean(run && run.closest('.page-slot') === page)
    }

    const applyClampedSelection = (state: DragState): void => {
      const selection = window.getSelection()
      if (!selection) return
      try {
        selection.setBaseAndExtent(
          state.anchorNode,
          state.anchorOffset,
          state.focusNode,
          state.focusOffset
        )
      } catch {
        // 节点在渲染更新中失效时忽略
      }
    }

    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement | null
      const run = target?.closest('.text-run')
      const page = run?.closest('.page-slot') as HTMLElement | null
      if (!run || !page) return
      const range = caretRange(event.clientX, event.clientY)
      if (!textRunAt(range, page) || !range) return
      drag = {
        page,
        anchorNode: range.startContainer,
        anchorOffset: range.startOffset,
        focusNode: range.startContainer,
        focusOffset: range.startOffset,
        pointerValid: true,
        frame: null
      }
    }

    const onMouseMove = (event: MouseEvent): void => {
      if (!drag) return
      const sheet = drag.page.querySelector('.page-sheet')
      if (!sheet) return
      const rect = sheet.getBoundingClientRect()
      const inside = event.clientX >= rect.left - 4
        && event.clientX <= rect.right + 4
        && event.clientY >= rect.top - 4
        && event.clientY <= rect.bottom + 4
      const range = inside ? caretRange(event.clientX, event.clientY) : null
      const valid = inside && textRunAt(range, drag.page)
      if (valid && range) {
        drag.focusNode = range.startContainer
        drag.focusOffset = range.startOffset
      }
      drag.pointerValid = valid
      if (!valid) {
        if (drag.frame == null) {
          drag.frame = requestAnimationFrame(() => {
            if (!drag) return
            drag.frame = null
            if (!drag.pointerValid) applyClampedSelection(drag)
          })
        }
      } else if (drag.frame != null) {
        cancelAnimationFrame(drag.frame)
        drag.frame = null
      }
    }

    const onMouseUp = (): void => {
      if (!drag) return
      const state = drag
      if (!state.pointerValid) {
        applyClampedSelection(state)
      }
      if (state.frame != null) cancelAnimationFrame(state.frame)
      drag = null
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('mouseup', onMouseUp, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      if (drag?.frame != null) cancelAnimationFrame(drag.frame)
    }
  }, [active])

  useEffect(() => {
    if (!active) {
      window.getSelection()?.removeAllRanges()
    }
  }, [active])

  const commitPageInput = (): void => {
    const parsed = Number.parseInt(pageInput, 10)
    if (Number.isNaN(parsed)) {
      setPageInput(String(currentPage))
      return
    }
    goToPage(parsed)
    setPageInput(String(clamp(Math.round(parsed), 1, doc.pageCount)))
  }

  const ready = containerSize.width > 0

  return (
    <div className="viewer">
      <div className="doc-bar">
        <div className="doc-id">
          <div className="doc-icon">
            <IconFile size={20} />
          </div>
          <div className="doc-id-text">
            <div className="doc-name" title={doc.name}>
              {doc.name}
            </div>
            <div className="doc-sub">
              {doc.demo ? '内置示例 · ' : ''}
              <span className={`format-badge ${doc.kind.toLowerCase()}`}>{doc.kind}</span>
              {formatSize(doc.size)} · {doc.pageCount} 页 ·{' '}
              {doc.signed ? '包含签名' : '无签名'}
            </div>
          </div>
        </div>

        <div className="doc-actions">
          <div className="page-nav" aria-label="翻页">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="上一页"
            >
              <IconChevronLeft size={16} />
            </button>
            <input
              ref={pageInputRef}
              className="page-input"
              value={pageInput}
              inputMode="numeric"
              aria-label="当前页码"
              onChange={(event) =>
                setPageInput(event.target.value.replace(/\D/g, '').slice(0, 5))
              }
              onFocus={(event) => event.currentTarget.select()}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
            />
            <span className="page-total">/ {doc.pageCount}</span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= doc.pageCount}
              aria-label="下一页"
            >
              <IconChevronRight size={16} />
            </button>
          </div>

          <button
            className={`icon-btn ${searchOpen ? 'active' : ''}`}
            data-action="search"
            onClick={() => setSearchOpen((value) => !value)}
            aria-pressed={searchOpen}
            title="查找（Ctrl + F）"
          >
            <IconSearch size={15} />
            <span>查找</span>
          </button>

          <button
            className="icon-btn"
            data-action="convert"
            onClick={onConvert}
            title={`转换为 ${doc.kind === 'PDF' ? 'OFD' : 'PDF'}`}
          >
            <IconSwap size={15} />
            <span>转换</span>
          </button>

          <button
            className={`icon-btn ${navOpen ? 'active' : ''}`}
            data-action="nav"
            onClick={() => setNavOpen((value) => !value)}
            disabled={doc.pageCount <= 1 && outline.length === 0}
            aria-pressed={navOpen}
            title="导航（缩略图 / 目录）"
          >
            <IconPages size={15} />
            <span>导航</span>
          </button>

          <button
            className="icon-btn"
            onClick={() => void window.adou.revealPath(doc.path)}
            title="在文件夹中显示"
          >
            <IconLocation size={15} />
            <span>在文件夹中显示</span>
          </button>
          <button
            className="icon-btn"
            data-action="close"
            onClick={onClose}
            title="关闭文档"
          >
            <IconClose size={15} />
            <span>关闭</span>
          </button>
        </div>
      </div>

      <SearchPanel
        backend={backend}
        docId={doc.id}
        open={searchOpen}
        onClose={closeSearch}
        onNavigate={focusSearchHit}
        onHitsChange={handleSearchHits}
      />

      <div className="reader-body">
        {navOpen ? (
          <DocumentNav
            backend={backend}
            doc={doc}
            currentPage={currentPage}
            tab={navTab}
            onTabChange={setNavTab}
            outline={outline}
            outlineLoading={outlineLoading}
            outlineError={outlineError}
            thumbsEnabled={firstPageReady}
            onSelectPage={(page) => goToPage(page)}
            onClose={() => setNavOpen(false)}
          />
        ) : null}

        <div className="pages-area">
          <div className="pages-viewport" ref={scrollRef} tabIndex={0}>
            <div className="pages-stack">
              {doc.pages.map((meta) => {
                const widthMm = meta.widthMm > 0 ? meta.widthMm : 210
                const heightMm = meta.heightMm > 0 ? meta.heightMm : 297
                const width = Math.max(80, Math.round(widthMm * PX_PER_MM * effectiveZoom))
                const height = Math.max(100, Math.round(heightMm * PX_PER_MM * effectiveZoom))
                return (
                  <PageCanvas
                    key={`${doc.id}-${meta.index}`}
                    backend={backend}
                    docId={doc.id}
                    page={meta.index}
                    dpi={renderDpi}
                    width={width}
                    height={height}
                    shouldRender={renderedPages.has(meta.index)}
                    ready={ready}
                    highlights={searchHighlights.get(meta.index)}
                    onLoaded={meta.index === 1 ? markFirstPageReady : undefined}
                    registerRef={(element) => {
                      pageRefs.current[meta.index - 1] = element
                    }}
                  />
                )
              })}
            </div>
          </div>

          <div className="zoom-dock" role="toolbar" aria-label="缩放与页码">
            <button
              className="dock-btn"
              onClick={() => zoomBy(1 / ZOOM_FACTOR)}
              title="缩小（Ctrl + -）"
              aria-label="缩小"
            >
              <IconMinus size={16} />
            </button>
            <ZoomMenu
              percent={effectiveZoom}
              mode={zoomMode}
              onPreset={applyPreset}
              onFit={applyFit}
            />
            <button
              className="dock-btn zoom-in"
              onClick={() => zoomBy(ZOOM_FACTOR)}
              title="放大（Ctrl + +）"
              aria-label="放大"
            >
              <IconPlus size={16} />
            </button>
            <span className="dock-divider" />
            <button
              className={`dock-btn ${zoomMode === 'fit-width' ? 'active' : ''}`}
              onClick={() => applyFit('fit-width')}
              title="适合宽度"
              aria-label="适合宽度"
              aria-pressed={zoomMode === 'fit-width'}
            >
              <IconFitWidth size={16} />
            </button>
            <button
              className={`dock-btn ${zoomMode === 'fit-page' ? 'active' : ''}`}
              onClick={() => applyFit('fit-page')}
              title="适合页面"
              aria-label="适合页面"
              aria-pressed={zoomMode === 'fit-page'}
            >
              <IconFitPage size={16} />
            </button>
            <span className="dock-divider" />
            <span className="dock-page">
              {currentPage} / {doc.pageCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

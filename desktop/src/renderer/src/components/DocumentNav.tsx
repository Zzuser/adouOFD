import { useEffect, useMemo, useRef } from 'react'
import type { BackendInfo, DocumentSummary, OutlineItem } from '@shared/types'
import { isQuarterTurn, rotationOf, type RotationMap } from '@shared/rotation'
import { pageImageUrl } from '../api'
import { IconClose } from './icons'

export type NavTab = 'thumbs' | 'outline'

interface DocumentNavProps {
  backend: BackendInfo
  doc: DocumentSummary
  currentPage: number
  tab: NavTab
  onTabChange: (tab: NavTab) => void
  outline: OutlineItem[]
  outlineLoading: boolean
  outlineError: string | null
  thumbsEnabled: boolean
  rotations: RotationMap
  onSelectPage: (page: number) => void
  onClose: () => void
}

export function DocumentNav({
  backend,
  doc,
  currentPage,
  tab,
  onTabChange,
  outline,
  outlineLoading,
  outlineError,
  thumbsEnabled,
  rotations,
  onSelectPage,
  onClose
}: DocumentNavProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const outlineRefs = useRef<Array<HTMLButtonElement | null>>([])
  const canLoadThumbs =
    thumbsEnabled &&
    backend.status === 'ready' &&
    Boolean(backend.port) &&
    Boolean(backend.token)

  useEffect(() => {
    if (tab === 'thumbs') {
      itemRefs.current[currentPage - 1]?.scrollIntoView({ block: 'nearest' })
    }
  }, [currentPage, tab])

  const activeOutlineIndex = useMemo(() => {
    let active = -1
    for (let index = 0; index < outline.length; index++) {
      const page = outline[index].page
      if (page != null && page <= currentPage) {
        active = index
      }
    }
    return active
  }, [outline, currentPage])

  useEffect(() => {
    if (tab === 'outline' && activeOutlineIndex >= 0) {
      outlineRefs.current[activeOutlineIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeOutlineIndex, tab])

  return (
    <aside className="thumb-rail doc-nav" aria-label="文档导航">
      <div className="nav-tabs">
        <button
          className={`nav-tab ${tab === 'thumbs' ? 'active' : ''}`}
          data-nav-tab="thumbs"
          onClick={() => onTabChange('thumbs')}
        >
          缩略图
          <span className="nav-count">{doc.pageCount}</span>
        </button>
        <button
          className={`nav-tab ${tab === 'outline' ? 'active' : ''}`}
          data-nav-tab="outline"
          onClick={() => onTabChange('outline')}
        >
          目录
          {outline.length > 0 ? <span className="nav-count">{outline.length}</span> : null}
        </button>
        <button className="nav-close" onClick={onClose} title="收起导航" aria-label="收起导航">
          <IconClose size={13} />
        </button>
      </div>

      {tab === 'thumbs' ? (
        <div className="thumb-list">
          {doc.pages.map((page) => {
            const rotation = rotationOf(rotations, page.index)
            const quarterTurn = isQuarterTurn(rotation)
            const widthMm = page.widthMm || 210
            const heightMm = page.heightMm || 297
            return (
              <button
                key={page.index}
                ref={(element) => {
                  itemRefs.current[page.index - 1] = element
                }}
                className={`thumb-item ${page.index === currentPage ? 'active' : ''}`}
                data-page={page.index}
                data-rotation={rotation || undefined}
                onClick={() => onSelectPage(page.index)}
                title={`第 ${page.index} 页`}
                aria-current={page.index === currentPage ? 'page' : undefined}
              >
                <div
                  className="thumb-frame"
                  style={{
                    aspectRatio: quarterTurn
                      ? `${heightMm} / ${widthMm}`
                      : `${widthMm} / ${heightMm}`
                  }}
                >
                  {canLoadThumbs ? (
                    <img
                      src={pageImageUrl(backend, doc.id, page.index, 24, rotation)}
                      alt=""
                      loading={page.index <= 6 ? 'eager' : 'lazy'}
                      decoding="async"
                      draggable={false}
                    />
                  ) : null}
                </div>
                <span className="thumb-label">{page.index}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="outline-list">
          {outlineLoading ? (
            <div className="nav-empty">
              <span className="spinner" />
              正在读取目录…
            </div>
          ) : outlineError ? (
            <div className="nav-empty">{outlineError}</div>
          ) : outline.length === 0 ? (
            <div className="nav-empty">该文档没有目录</div>
          ) : (
            outline.map((item, index) => (
              <button
                key={`${index}-${item.title}`}
                ref={(element) => {
                  outlineRefs.current[index] = element
                }}
                className={`outline-item ${index === activeOutlineIndex ? 'active' : ''}`}
                style={{ paddingLeft: 8 + Math.min(item.level - 1, 8) * 12 }}
                disabled={item.page == null}
                onClick={() => {
                  if (item.page != null) onSelectPage(item.page)
                }}
                title={item.title}
              >
                <span className="outline-title">{item.title}</span>
                {item.page != null ? <span className="outline-page">{item.page}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  )
}

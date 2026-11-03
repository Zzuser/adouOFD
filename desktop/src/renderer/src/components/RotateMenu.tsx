import { useEffect, useRef, useState } from 'react'
import type { PageRotation } from '@shared/rotation'
import { IconChevronDown, IconRotate } from './icons'

interface RotateMenuProps {
  currentPage: number
  currentRotation: PageRotation
  hasRotation: boolean
  onRotate: (scope: 'current' | 'all', delta: 90 | -90) => void
  onReset: (scope: 'current' | 'all') => void
}

export function RotateMenu({
  currentPage,
  currentRotation,
  hasRotation,
  onRotate,
  onReset
}: RotateMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const run = (action: () => void): void => {
    action()
    setOpen(false)
  }

  return (
    <div className="rotate-menu" ref={rootRef}>
      <button
        className={`icon-btn ${hasRotation ? 'active' : ''}`}
        data-action="rotate"
        data-rotation={currentRotation || undefined}
        onClick={() => setOpen((value) => !value)}
        title={`旋转页面（R / Shift+R）当前页 ${currentRotation}°`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconRotate size={15} />
        <span>旋转</span>
        <IconChevronDown size={11} className="rotate-chevron" />
      </button>
      {open ? (
        <div className="rotate-popover" role="menu">
          <div className="rotate-head">
            第 {currentPage} 页 · {currentRotation}°
          </div>
          <button
            type="button"
            role="menuitem"
            data-rotate="current-left"
            onClick={() => run(() => onRotate('current', -90))}
          >
            当前页左转 90°
          </button>
          <button
            type="button"
            role="menuitem"
            data-rotate="current-right"
            onClick={() => run(() => onRotate('current', 90))}
          >
            当前页右转 90°
          </button>
          <div className="rotate-divider" />
          <button
            type="button"
            role="menuitem"
            data-rotate="all-left"
            onClick={() => run(() => onRotate('all', -90))}
          >
            全部页左转 90°
          </button>
          <button
            type="button"
            role="menuitem"
            data-rotate="all-right"
            onClick={() => run(() => onRotate('all', 90))}
          >
            全部页右转 90°
          </button>
          <div className="rotate-divider" />
          <button
            type="button"
            role="menuitem"
            data-rotate="reset-current"
            disabled={currentRotation === 0}
            onClick={() => run(() => onReset('current'))}
          >
            重置当前页
          </button>
          <button
            type="button"
            role="menuitem"
            data-rotate="reset-all"
            disabled={!hasRotation}
            onClick={() => run(() => onReset('all'))}
          >
            重置全部页
          </button>
        </div>
      ) : null}
    </div>
  )
}

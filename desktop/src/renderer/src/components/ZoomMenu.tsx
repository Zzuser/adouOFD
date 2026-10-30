import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from './icons'

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

interface ZoomMenuProps {
  percent: number
  mode: ZoomMode
  onPreset: (scale: number) => void
  onFit: (mode: 'fit-width' | 'fit-page') => void
}

const PRESETS = [50, 75, 100, 125, 150, 200, 300]

export function ZoomMenu({ percent, mode, onPreset, onFit }: ZoomMenuProps) {
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

  return (
    <div className="zoom-menu" ref={rootRef}>
      <button
        className="dock-btn zoom-value"
        onClick={() => setOpen((value) => !value)}
        title="缩放比例"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {Math.round(percent * 100)}%
        <IconChevronDown size={11} />
      </button>
      {open ? (
        <div className="zoom-popover" role="menu">
          <button
            className={mode === 'fit-width' ? 'active' : ''}
            onClick={() => {
              onFit('fit-width')
              setOpen(false)
            }}
          >
            适合宽度
          </button>
          <button
            className={mode === 'fit-page' ? 'active' : ''}
            onClick={() => {
              onFit('fit-page')
              setOpen(false)
            }}
          >
            适合页面
          </button>
          <div className="zoom-divider" />
          {PRESETS.map((preset) => (
            <button
              key={preset}
              className={
                mode === 'custom' && Math.abs(percent * 100 - preset) < 0.6 ? 'active' : ''
              }
              onClick={() => {
                onPreset(preset / 100)
                setOpen(false)
              }}
            >
              {preset}%
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

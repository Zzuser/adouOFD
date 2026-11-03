import { useEffect, useRef } from 'react'
import { IconClose, IconPlus } from './icons'

export interface DocTabItem {
  id: string
  name: string
  kind: string
  path: string
  dirty?: boolean
}

interface DocTabsProps {
  tabs: DocTabItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onOpen: () => void
}

export function DocTabs({ tabs, activeId, onSelect, onClose, onOpen }: DocTabsProps) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  return (
    <div className="doc-tabs" role="tablist" aria-label="已打开的文档">
      {tabs.map((tab) => (
        <div
          className={`doc-tab ${tab.id === activeId ? 'active' : ''}`}
          key={tab.id}
          ref={tab.id === activeId ? activeRef : undefined}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              onClose(tab.id)
            }
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeId}
            className="doc-tab-main"
            data-action="doc-tab"
            data-tab-id={tab.id}
            title={tab.path}
            onClick={() => onSelect(tab.id)}
          >
            <span className={`format-badge ${tab.kind.toLowerCase()}`}>{tab.kind}</span>
            <span className="doc-tab-name">{tab.name}</span>
            {tab.dirty ? (
              <span className="doc-tab-dirty" title="有未保存的修改" aria-label="有未保存的修改" />
            ) : null}
          </button>
          <button
            type="button"
            className="doc-tab-close"
            data-action="doc-tab-close"
            aria-label={`关闭 ${tab.name}`}
            title="关闭标签"
            onClick={() => onClose(tab.id)}
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="doc-tab-add"
        data-action="doc-tab-open"
        title="打开文档"
        aria-label="打开文档"
        onClick={onOpen}
      >
        <IconPlus size={15} />
      </button>
    </div>
  )
}

import { useState } from 'react'
import type { RecentFile } from '@shared/types'
import mascotEmpty from '../assets/mascot-empty.webp'
import mascotLoading from '../assets/mascot-loading.webp'
import { IconClose, IconFolder, IconLocation, IconPlus } from './icons'

interface EmptyStateProps {
  ready: boolean
  busy: boolean
  engineStarting: boolean
  onOpen: () => void
  onNewMarkdown: () => void
  onNewText: () => void
  onDropFiles: (files: FileList) => void
  recentFiles: RecentFile[]
  onOpenRecent: (entry: RecentFile) => void
  onRevealRecent: (path: string) => void
  onRemoveRecent: (path: string) => void
  onClearRecent: () => void
}

export function EmptyState({
  ready,
  busy,
  engineStarting,
  onOpen,
  onNewMarkdown,
  onNewText,
  onDropFiles,
  recentFiles,
  onOpenRecent,
  onRevealRecent,
  onRemoveRecent,
  onClearRecent
}: EmptyStateProps) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className={`empty ${dragOver ? 'drag' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        onDropFiles(event.dataTransfer.files)
      }}
    >
      <div className="hero-art-mascot" aria-hidden="true">
        <img
          className={engineStarting ? 'is-loading' : undefined}
          src={engineStarting ? mascotLoading : mascotEmpty}
          alt=""
          draggable={false}
        />
      </div>

      <h2>{dragOver ? '松开以打开文档' : '打开或新建文档'}</h2>
      <p>
        选择或拖入本地 OFD / PDF / Markdown / 文本文件，也可新建 Markdown 或文本；
        文档仅在本机处理，不上传。
      </p>

      <div className="empty-actions">
        <button
          className="btn primary"
          data-action="open"
          onClick={onOpen}
          disabled={busy}
        >
          {busy ? <span className="btn-spinner" /> : <IconFolder size={17} />}
          打开文档
        </button>
        <button
          className="btn ghost"
          data-action="new-markdown"
          onClick={onNewMarkdown}
          disabled={busy}
        >
          <IconPlus size={17} />
          新建 Markdown
        </button>
        <button
          className="btn ghost"
          data-action="new-text"
          onClick={onNewText}
          disabled={busy}
        >
          <IconPlus size={17} />
          新建文本
        </button>
      </div>

      {recentFiles.length > 0 ? (
        <section className="recent-files" aria-label="最近打开">
          <div className="recent-head">
            <span>最近打开</span>
            <button
              type="button"
              className="recent-clear"
              data-action="recent-clear"
              onClick={onClearRecent}
            >
              清空
            </button>
          </div>
          <ul>
            {recentFiles.slice(0, 6).map((entry) => (
              <li key={entry.path} className="recent-item" data-recent-path={entry.path}>
                <button
                  type="button"
                  className="recent-open"
                  onClick={() => onOpenRecent(entry)}
                  title={entry.path}
                >
                  <span className={`format-badge ${entry.kind.toLowerCase()}`}>{entry.kind}</span>
                  <span className="recent-name">{entry.name}</span>
                  <span className="recent-meta">
                    {entry.pageCount > 0 ? `${entry.pageCount} 页` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="recent-icon"
                  data-action="recent-reveal"
                  title="在文件夹中显示"
                  aria-label={`在文件夹中显示 ${entry.name}`}
                  onClick={() => onRevealRecent(entry.path)}
                >
                  <IconLocation size={13} />
                </button>
                <button
                  type="button"
                  className="recent-icon"
                  data-action="recent-remove"
                  title="从最近列表移除"
                  aria-label={`从最近列表移除 ${entry.name}`}
                  onClick={() => onRemoveRecent(entry.path)}
                >
                  <IconClose size={13} />
                </button>
              </li>
            ))}
          </ul>
          {recentFiles.length > 6 ? <div className="recent-more">仅显示最近 6 个</div> : null}
        </section>
      ) : null}

      <div className="empty-hint">
        {engineStarting
          ? '本地引擎正在启动，通常需要 2–3 秒…'
          : ready
            ? '支持 .ofd / .pdf / .md / .markdown / .txt · 阅读、编辑与实时预览'
            : '本地引擎正在启动；Markdown / 文本可正常打开和新建。'}
      </div>
    </div>
  )
}

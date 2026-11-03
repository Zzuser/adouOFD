import { useState } from 'react'
import type { RecentFile } from '@shared/types'
import mascotEmpty from '../assets/mascot-empty.webp'
import mascotLoading from '../assets/mascot-loading.webp'
import { IconClose, IconFile, IconFolder, IconLocation, IconSpark } from './icons'

interface EmptyStateProps {
  ready: boolean
  busy: boolean
  engineStarting: boolean
  onOpen: () => void
  onDemo: () => void
  onPdfDemo: () => void
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
  onDemo,
  onPdfDemo,
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

      <h2>{dragOver ? '松开以打开文档' : '打开 OFD / PDF 文档'}</h2>
      <p>选择或拖入本地文件。文档仅在本机处理，不上传。</p>

      <div className="empty-actions">
        <button
          className="btn primary"
          data-action="open"
          onClick={onOpen}
          disabled={!ready || busy}
        >
          {busy ? <span className="btn-spinner" /> : <IconFolder size={17} />}
          打开文档
        </button>
        <button
          className="btn ghost"
          data-action="demo-ofd"
          onClick={onDemo}
          disabled={!ready || busy}
        >
          <IconSpark size={17} />
          OFD 示例
        </button>
        <button
          className="btn ghost"
          data-action="demo-pdf"
          onClick={onPdfDemo}
          disabled={!ready || busy}
        >
          <IconFile size={17} />
          PDF 示例
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
            ? '支持 .ofd / .pdf · 多页 · 缩放 · 目录 · 文字复制'
            : '本地引擎未就绪，请查看左侧状态或重试。'}
      </div>
    </div>
  )
}

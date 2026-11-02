import { useState } from 'react'
import mascotEmpty from '../assets/mascot-empty.webp'
import mascotLoading from '../assets/mascot-loading.webp'
import { IconFile, IconFolder, IconSpark } from './icons'

interface EmptyStateProps {
  ready: boolean
  busy: boolean
  engineStarting: boolean
  onOpen: () => void
  onDemo: () => void
  onPdfDemo: () => void
  onDropFiles: (files: FileList) => void
}

export function EmptyState({
  ready,
  busy,
  engineStarting,
  onOpen,
  onDemo,
  onPdfDemo,
  onDropFiles
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

      <h2>{dragOver ? '松开即可打开' : '把文档交给阿豆'}</h2>
      <p>
        拖拽或选择本地文件。电子发票、公文、PDF 合同都可以安静地读，
        文件只在本机处理。
      </p>

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

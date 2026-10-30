import { useState } from 'react'
import { BrandMark, IconFile, IconFolder, IconSpark } from './icons'

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
      <div className="hero-art" aria-hidden="true">
        <div className="paper paper-back" />
        <div className="paper paper-front">
          <span className="paper-tag">OFD · PDF</span>
          <span className="paper-line w80" />
          <span className="paper-line w95" />
          <span className="paper-line w60" />
          <span className="paper-line w85" />
          <span className="paper-line w40" />
        </div>
        <div className="hero-bean">
          <BrandMark size={58} />
        </div>
      </div>

      <h2>{dragOver ? '松开即可打开' : '打开一份 OFD 或 PDF 文档'}</h2>
      <p>
        拖拽或选择本地文件。电子发票、公文、PDF 合同均可查看，
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

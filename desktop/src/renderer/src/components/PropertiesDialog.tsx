import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendInfo, DocumentProperties, DocumentSummary } from '@shared/types'
import { fetchDocumentProperties, messageOf } from '../api'
import { IconAlert, IconClose } from './icons'

const METADATA_LABELS: Record<string, string> = {
  title: '标题',
  author: '作者',
  subject: '主题',
  keywords: '关键词',
  creator: '创建工具',
  producer: '生成工具',
  creationDate: '创建时间',
  modificationDate: '修改时间',
  pdfVersion: 'PDF 版本',
  ofdVersion: 'OFD 版本',
  docId: '文档 ID',
  creatorVersion: '创建工具版本',
  abstract: '摘要',
  docUsage: '文档用途'
}

const METADATA_ORDER = [
  'title',
  'author',
  'subject',
  'keywords',
  'creator',
  'producer',
  'creationDate',
  'modificationDate',
  'pdfVersion',
  'ofdVersion',
  'docId',
  'creatorVersion',
  'abstract',
  'docUsage'
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatMm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function pageSizeText(doc: DocumentSummary): string {
  const sizes = Array.from(
    new Set(doc.pages.map((page) => `${formatMm(page.widthMm)} × ${formatMm(page.heightMm)} mm`))
  )
  if (sizes.length === 0) return '未知'
  if (sizes.length <= 3) return sizes.join('、')
  return `${sizes.slice(0, 3).join('、')} 等 ${sizes.length} 种`
}

interface PropertiesDialogProps {
  open: boolean
  backend: BackendInfo
  doc: DocumentSummary
  onClose: () => void
}

export function PropertiesDialog({ open, backend, doc, onClose }: PropertiesDialogProps) {
  const [properties, setProperties] = useState<DocumentProperties | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setProperties(null)
    setError(null)
    setLoading(true)
    let alive = true
    fetchDocumentProperties(backend, doc.id)
      .then((value) => {
        if (alive) setProperties(value)
      })
      .catch((reason: unknown) => {
        if (alive) setError(messageOf(reason))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, backend, doc.id, attempt])

  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  if (!open) return null

  const metadataEntries = properties
    ? METADATA_ORDER.filter((key) => properties.metadata[key]).map((key) => ({
        key,
        label: METADATA_LABELS[key] ?? key,
        value: properties.metadata[key]
      }))
    : []

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="properties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="properties-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="properties-head">
          <div>
            <h2 id="properties-title">文档属性</h2>
            <p title={doc.name}>{doc.name}</p>
          </div>
          <button
            type="button"
            className="about-close"
            data-action="properties-close"
            onClick={onClose}
            aria-label="关闭文档属性"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="properties-body">
          <section className="properties-section">
            <h3>基本信息</h3>
            <dl className="properties-grid">
              <div>
                <dt>格式</dt>
                <dd>{doc.kind}</dd>
              </div>
              <div>
                <dt>页数</dt>
                <dd>{doc.pageCount} 页</dd>
              </div>
              <div>
                <dt>文件大小</dt>
                <dd>{formatSize(doc.size)}</dd>
              </div>
              <div>
                <dt>页面尺寸</dt>
                <dd>{pageSizeText(doc)}</dd>
              </div>
              <div className="properties-wide">
                <dt>文件路径</dt>
                <dd className="properties-path" title={doc.path}>
                  {doc.path}
                </dd>
              </div>
            </dl>
          </section>

          {loading ? (
            <div className="properties-status">
              <span className="spinner" />
              正在读取文档属性…
            </div>
          ) : error ? (
            <div className="properties-status properties-error">
              <IconAlert size={14} />
              <span>{error}</span>
              <button type="button" className="btn ghost" onClick={retry}>
                重试
              </button>
            </div>
          ) : properties ? (
            <>
              <section className="properties-section">
                <h3>文档属性</h3>
                {metadataEntries.length > 0 ? (
                  <dl className="properties-grid">
                    {metadataEntries.map((entry) => (
                      <div key={entry.key}>
                        <dt>{entry.label}</dt>
                        <dd>{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="properties-empty">文档未包含可读取的属性信息。</p>
                )}
              </section>

              <section className="properties-section">
                <h3>
                  签名
                  {properties.signatures.length > 0 ? (
                    <span className="properties-count">{properties.signatures.length}</span>
                  ) : null}
                </h3>
                {properties.signatures.length > 0 ? (
                  <div className="properties-signatures">
                    {properties.signatures.map((signature, index) => (
                      <div className="properties-signature" key={index}>
                        <div className="properties-signature-name">
                          {signature.name || `签名 ${index + 1}`}
                        </div>
                        <div className="properties-signature-meta">
                          {signature.signTime ? <span>时间：{signature.signTime}</span> : null}
                          {signature.reason ? <span>{signature.reason}</span> : null}
                          {signature.location ? <span>位置：{signature.location}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="properties-empty">未发现签名条目。</p>
                )}
                <p className="properties-note properties-signature-note">
                  仅展示签名信息，不验证签名有效性。
                </p>
              </section>

              {properties.warning ? (
                <div className="properties-warning">
                  <IconAlert size={14} />
                  {properties.warning}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

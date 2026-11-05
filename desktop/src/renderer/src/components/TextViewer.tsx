import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react'
import type { TextFileData } from '@shared/types'
import { fileNameOf, textKindOf, type TextEncoding } from '@shared/text-paths'
import {
  extractMarkdownOutline,
  normalizeHeadingText,
  type MarkdownHeading
} from '@shared/markdown-outline'
import { messageOf } from '../api'
import '../text.css'
import { MarkdownPreview } from './MarkdownPreview'
import { TextEditor, type TextEditorHandle } from './TextEditor'
import { IconClose, IconFile, IconLocation } from './icons'

type TextMode = 'split' | 'edit' | 'preview'

export interface TextViewerHandle {
  save: () => Promise<boolean>
  isDirty: () => boolean
}

interface TextViewerProps {
  path: string
  active: boolean
  onDirtyChange: (dirty: boolean) => void
  onOpenPath: (path: string) => void
  onClose: () => void
}

const ENCODING_LABELS: Record<TextEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8 BOM',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  gb18030: 'GB18030'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const TextViewer = forwardRef<TextViewerHandle, TextViewerProps>(function TextViewer(
  { path, active, onDirtyChange, onOpenPath, onClose },
  ref
) {
  const [doc, setDoc] = useState<TextFileData | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [mode, setMode] = useState<TextMode>('split')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportInfo, setExportInfo] = useState<string | null>(null)
  const [conflict, setConflict] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem('adou.text.splitRatio'))
      return Number.isFinite(stored) && stored >= 0.2 && stored <= 0.8 ? stored : 0.5
    } catch {
      return 0.5
    }
  })
  const [resizing, setResizing] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [syncScroll, setSyncScroll] = useState(() => {
    try {
      return window.localStorage.getItem('adou.text.syncScroll') !== '0'
    } catch {
      return true
    }
  })

  const bodyRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const outlineRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<TextEditorHandle>(null)
  const syncSuppressRef = useRef(0)
  const splitRatioRef = useRef(splitRatio)
  splitRatioRef.current = splitRatio
  const resizingRef = useRef(false)

  const docRef = useRef<TextFileData | null>(null)
  docRef.current = doc
  const contentRef = useRef(content)
  contentRef.current = content
  const savingRef = useRef(false)
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange

  const kind = textKindOf(path) ?? 'TXT'
  const markdown = kind === 'MD'
  const dirty = doc !== null && content !== savedContent
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    void window.adou
      .readTextFile(path)
      .then((data) => {
        if (!alive) return
        setDoc(data)
        setContent(data.content)
        setSavedContent(data.content)
        setPreviewContent(data.content)
        setSavedAt(null)
        setConflict(null)
        setSaveError(null)
      })
      .catch((reason: unknown) => {
        if (alive) setLoadError(messageOf(reason))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [path, reloadToken])

  useEffect(() => {
    onDirtyChangeRef.current(dirty)
  }, [dirty])

  useEffect(() => {
    return () => onDirtyChangeRef.current(false)
  }, [])

  useEffect(() => {
    if (!markdown) return
    const timer = window.setTimeout(() => setPreviewContent(content), 150)
    return () => window.clearTimeout(timer)
  }, [content, markdown])

  const save = useCallback(async (expectedOverride?: number | null): Promise<boolean> => {
    const current = docRef.current
    if (!current || savingRef.current) return false
    const snapshot = contentRef.current
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const result = await window.adou.writeTextFile({
        path: current.path,
        content: snapshot,
        encoding: current.encoding,
        eol: current.eol,
        expectedModifiedAt:
          expectedOverride === undefined ? current.modifiedAt : expectedOverride
      })
      if (!result.ok) {
        if (result.code === 'CONFLICT') {
          setConflict(result.onDiskModifiedAt ?? 0)
        } else {
          setSaveError(result.message ?? '保存失败')
        }
        return false
      }
      setSavedContent(snapshot)
      setConflict(null)
      setSavedAt(Date.now())
      setDoc((previous) =>
        previous
          ? {
              ...previous,
              modifiedAt: result.modifiedAt ?? previous.modifiedAt,
              size: result.size ?? previous.size
            }
          : previous
      )
      return true
    } catch (reason) {
      setSaveError(messageOf(reason))
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [])

  useImperativeHandle(ref, () => ({ save: () => save(), isDirty: () => dirtyRef.current }), [save])

  useEffect(() => {
    if (!active) return
    const listener = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [active, save])

  const reload = useCallback((): void => {
    if (dirty && !window.confirm('放弃未保存的修改并重新加载？')) return
    setReloadToken((value) => value + 1)
  }, [dirty])

  const waitForPreviewImages = useCallback(async (): Promise<void> => {
    const images = Array.from(previewRef.current?.querySelectorAll('img') ?? [])
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve()
              return
            }
            const finish = (): void => resolve()
            image.addEventListener('load', finish, { once: true })
            image.addEventListener('error', finish, { once: true })
            window.setTimeout(finish, 2000)
          })
      )
    )
  }, [])

  const exportPdf = useCallback(async (): Promise<void> => {
    if (exporting || !markdown || !docRef.current) return
    setExporting(true)
    setSaveError(null)
    setExportInfo(null)
    try {
      setPreviewContent(contentRef.current)
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
      })
      await waitForPreviewImages()
      // 公式使用 KaTeX 自带字体；字体未就绪时导出会退回系统字体
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 3000))
      ])
      const result = await window.adou.exportTextPdf({ sourcePath: path })
      if (result.ok && result.path) {
        setExportInfo(result.path)
      } else if (!result.canceled) {
        setSaveError(result.error ?? '导出 PDF 失败')
      }
    } catch (reason) {
      setSaveError(messageOf(reason))
    } finally {
      setExporting(false)
    }
  }, [exporting, markdown, path, waitForPreviewImages])

  const stats = useMemo(() => {
    const lines = content.length === 0 ? 1 : content.split('\n').length
    const characters = content.replace(/\s/g, '').length
    return { lines, characters }
  }, [content])

  const outline = useMemo(
    () => (markdown ? extractMarkdownOutline(previewContent) : []),
    [markdown, previewContent]
  )

  const persistSplitRatio = useCallback((value: number) => {
    try {
      window.localStorage.setItem('adou.text.splitRatio', String(value))
    } catch {
      // 本地存储不可用时仅保持当前会话比例
    }
  }, [])

  const applySplitRatio = useCallback((value: number): number => {
    const next = Math.min(0.8, Math.max(0.2, value))
    splitRatioRef.current = next
    setSplitRatio(next)
    return next
  }, [])

  const ratioAtClientX = (clientX: number): number => {
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return splitRatioRef.current
    return (clientX - rect.left) / rect.width
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizingRef.current = true
    setResizing(true)
  }

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!resizingRef.current) return
    applySplitRatio(ratioAtClientX(event.clientX))
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!resizingRef.current) return
    resizingRef.current = false
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    persistSplitRatio(splitRatioRef.current)
  }

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home') {
      return
    }
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? applySplitRatio(0.5)
        : applySplitRatio(splitRatioRef.current + (event.key === 'ArrowLeft' ? -0.02 : 0.02))
    persistSplitRatio(next)
  }

  useEffect(() => {
    document.body.classList.toggle('text-resizing', resizing)
    return () => document.body.classList.remove('text-resizing')
  }, [resizing])

  useEffect(() => {
    if (!outlineOpen) return
    const close = (event: PointerEvent): void => {
      if (!outlineRef.current?.contains(event.target as Node)) setOutlineOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [outlineOpen])

  useEffect(() => {
    if (!markdown || !syncScroll || mode !== 'split' || loading) return
    let cleanup: (() => void) | null = null
    const timer = window.setTimeout(() => {
      const editor = bodyRef.current?.querySelector<HTMLElement>('.cm-scroller')
      const preview = previewRef.current
      if (!editor || !preview) return
      let lockUntil = 0
      const sync = (source: HTMLElement, target: HTMLElement): void => {
        const now = performance.now()
        if (now < lockUntil || now < syncSuppressRef.current) return
        const sourceMax = source.scrollHeight - source.clientHeight
        const ratio = sourceMax > 0 ? source.scrollTop / sourceMax : 0
        lockUntil = now + 100
        target.scrollTop = ratio * Math.max(0, target.scrollHeight - target.clientHeight)
      }
      const onEditorScroll = (): void => sync(editor, preview)
      const onPreviewScroll = (): void => sync(preview, editor)
      editor.addEventListener('scroll', onEditorScroll, { passive: true })
      preview.addEventListener('scroll', onPreviewScroll, { passive: true })
      cleanup = () => {
        editor.removeEventListener('scroll', onEditorScroll)
        preview.removeEventListener('scroll', onPreviewScroll)
      }
    }, 60)
    return () => {
      window.clearTimeout(timer)
      cleanup?.()
    }
  }, [markdown, syncScroll, mode, loading, doc?.path])

  const toggleScrollSync = (): void => {
    setSyncScroll((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem('adou.text.syncScroll', next ? '1' : '0')
      } catch {
        // 本地存储不可用时仅保持当前会话状态
      }
      return next
    })
  }

  const goToHeading = (heading: MarkdownHeading): void => {
    setOutlineOpen(false)
    syncSuppressRef.current = performance.now() + 700
    if (mode !== 'preview') editorRef.current?.scrollToLine(heading.line)
    if (mode === 'edit') return
    const preview = previewRef.current
    if (!preview) return
    const candidates = Array.from(
      preview.querySelectorAll<HTMLElement>(`h${heading.level}`)
    )
    const target =
      candidates.find(
        (element) => normalizeHeadingText(element.textContent ?? '') === heading.text
      ) ?? candidates[0]
    if (!target) return
    const top =
      target.getBoundingClientRect().top -
      preview.getBoundingClientRect().top +
      preview.scrollTop -
      12
    preview.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }

  const splitStyle =
    markdown && mode === 'split'
      ? {
          gridTemplateColumns: `minmax(0, ${splitRatio}fr) 16px minmax(0, ${
            1 - splitRatio
          }fr)`
        }
      : undefined

  return (
    <div className="text-viewer" data-text-viewer>
      <div className="doc-bar text-doc-bar">
        <div className="doc-id">
          <div className={`doc-icon text-icon ${kind === 'MD' ? 'md' : ''}`}>
            <IconFile size={20} />
          </div>
          <div className="doc-id-text">
            <div className="doc-name" title={path}>
              {fileNameOf(path)}
              {dirty ? <span className="text-dirty-dot" title="有未保存的修改" /> : null}
            </div>
            <div className="doc-sub">
              <span className={`format-badge ${kind.toLowerCase()}`}>{kind}</span>
              {doc ? (
                <>
                  {ENCODING_LABELS[doc.encoding]} · {doc.eol === 'crlf' ? 'CRLF' : 'LF'} ·{' '}
                  {formatSize(doc.size)}
                </>
              ) : (
                '文本文件'
              )}
            </div>
          </div>
        </div>

        <div className="doc-actions text-actions">
          {markdown ? (
            <div className="text-mode-switch" role="group" aria-label="视图模式">
              {(
                [
                  ['split', '分栏'],
                  ['edit', '编辑'],
                  ['preview', '预览']
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={mode === value ? 'active' : ''}
                  data-action={`text-mode-${value}`}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {markdown && outline.length > 0 ? (
            <div className="text-outline-wrap" ref={outlineRef}>
              <button
                type="button"
                className={`icon-btn text-outline-btn ${outlineOpen ? 'active' : ''}`}
                data-action="text-outline"
                aria-expanded={outlineOpen}
                title="文档目录"
                onClick={() => setOutlineOpen((value) => !value)}
              >
                目录
              </button>
              {outlineOpen ? (
                <div className="text-outline-popover" role="menu" aria-label="文档目录">
                  {outline.map((heading, index) => (
                    <button
                      type="button"
                      key={`${heading.line}-${index}`}
                      role="menuitem"
                      className="text-outline-item"
                      data-outline-line={heading.line}
                      style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
                      title={heading.text}
                      onClick={() => goToHeading(heading)}
                    >
                      {heading.text}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {markdown && mode === 'split' ? (
            <button
              type="button"
              className={`text-sync-toggle ${syncScroll ? 'active' : ''}`}
              data-action="text-scroll-sync"
              aria-pressed={syncScroll}
              title="同步编辑区与预览区滚动"
              onClick={toggleScrollSync}
            >
              同步
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary small"
            data-action="text-save"
            disabled={!dirty || saving || loading || Boolean(loadError)}
            title="保存（Ctrl+S）"
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            className="btn ghost small"
            data-action="text-reload"
            disabled={loading}
            onClick={reload}
            title="从磁盘重新读取"
          >
            重新加载
          </button>
          {markdown ? (
            <button
              type="button"
              className="btn ghost small"
              data-action="text-export-pdf"
              disabled={exporting || loading}
              title="把预览内容导出为 A4 PDF"
              onClick={() => void exportPdf()}
            >
              {exporting ? '导出中…' : '导出 PDF'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn ghost small text-reveal"
            data-action="text-reveal"
            onClick={() => void window.adou.revealPath(path)}
            title="在文件夹中显示"
          >
            <IconLocation size={13} />
          </button>
          <button
            type="button"
            className="icon-btn compact"
            data-action="text-close"
            aria-label="关闭标签"
            title="关闭标签"
            onClick={onClose}
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {conflict !== null ? (
        <div className="text-banner warn" role="alert">
          <span>文件已在其他程序中修改。覆盖保存会丢失外部修改。</span>
          <button
            type="button"
            className="btn ghost small"
            data-action="text-overwrite"
            onClick={() => void save(conflict)}
          >
            覆盖保存
          </button>
          <button
            type="button"
            className="btn ghost small"
            data-action="text-reload-conflict"
            onClick={reload}
          >
            重新加载
          </button>
        </div>
      ) : null}

      {saveError ? (
        <div className="text-banner error" role="alert">
          <span>{saveError}</span>
          <button
            type="button"
            className="text-banner-close"
            aria-label="关闭提示"
            onClick={() => setSaveError(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {exportInfo ? (
        <div className="text-banner info" role="status">
          <span className="text-export-path" title={exportInfo}>
            已导出 PDF：{exportInfo}
          </span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => void window.adou.revealPath(exportInfo)}
          >
            文件夹
          </button>
          <button
            type="button"
            className="text-banner-close"
            aria-label="关闭提示"
            onClick={() => setExportInfo(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="text-placeholder">
          <span className="print-notice-spinner" />
          正在读取文件…
        </div>
      ) : loadError ? (
        <div className="text-placeholder error">
          <p>{loadError}</p>
          <button type="button" className="btn ghost small" onClick={reload}>
            重试
          </button>
        </div>
      ) : (
        <>
          <div
            ref={bodyRef}
            className={`text-body ${markdown ? `mode-${mode}` : 'mode-edit'} ${
              resizing ? 'resizing' : ''
            }`}
            style={splitStyle}
          >
            <div className="text-editor-pane">
              <TextEditor
                ref={editorRef}
                value={content}
                markdown={markdown}
                visible={!markdown || mode !== 'preview'}
                onChange={setContent}
              />
            </div>
            {markdown && mode === 'split' ? (
              <div
                className={`text-splitter ${resizing ? 'active' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="调整编辑与预览宽度"
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={Math.round(splitRatio * 100)}
                data-action="text-splitter"
                tabIndex={0}
                title="拖动调整编辑与预览宽度，双击恢复 1:1"
                onPointerDown={startResize}
                onPointerMove={moveResize}
                onPointerUp={finishResize}
                onPointerCancel={finishResize}
                onDoubleClick={() => persistSplitRatio(applySplitRatio(0.5))}
                onKeyDown={resizeByKeyboard}
              >
                <span />
              </div>
            ) : null}
            {markdown ? (
              <div className="text-preview-pane" ref={previewRef}>
                <MarkdownPreview
                  content={previewContent}
                  documentPath={path}
                  onOpenPath={onOpenPath}
                />
              </div>
            ) : null}
          </div>
          <div className="text-status-bar">
            <span>{ENCODING_LABELS[doc?.encoding ?? 'utf-8']}</span>
            <span>{doc?.eol === 'crlf' ? 'CRLF' : 'LF'}</span>
            <span>{stats.lines} 行</span>
            <span>{stats.characters} 字</span>
            <span className={dirty ? 'dirty' : ''}>
              {dirty
                ? '未保存'
                : savedAt
                  ? `已保存 ${formatTime(savedAt)}`
                  : '已载入'}
            </span>
          </div>
        </>
      )}
    </div>
  )
})

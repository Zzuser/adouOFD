import type { MouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import 'highlight.js/styles/github.css'
import {
  TEXT_ASSET_SCHEME,
  resolveLocalReference,
  textAssetUrl
} from '@shared/text-paths'

interface MarkdownPreviewProps {
  content: string
  documentPath: string
  onOpenPath: (path: string) => void
}

export function MarkdownPreview({ content, documentPath, onOpenPath }: MarkdownPreviewProps) {
  const transformUrl = (url: string, key: string): string => {
    if (key === 'href') {
      if (/^(https?:|mailto:)/i.test(url) || url.startsWith('#')) return url
      return resolveLocalReference(documentPath, url) ? url : ''
    }
    if (key === 'src') {
      const resolved = resolveLocalReference(documentPath, url)
      return resolved ? textAssetUrl(resolved) : ''
    }
    return url
  }

  return (
    <article className="md-body" data-markdown-preview>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        urlTransform={transformUrl}
        components={{
          img({ src, alt }) {
            const value = typeof src === 'string' ? src : ''
            if (!value.startsWith(`${TEXT_ASSET_SCHEME}:`)) {
              return (
                <span className="md-image-note">
                  {alt ? `图片“${alt}”未加载` : '图片未加载'}（仅显示文档目录内的本地图片）
                </span>
              )
            }
            return <img src={value} alt={alt ?? ''} loading="lazy" />
          },
          a({ href, children }) {
            const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
              event.preventDefault()
              if (!href) return
              if (/^https?:/i.test(href)) {
                void window.adou.openExternal(href)
                return
              }
              if (href.startsWith('#')) {
                document
                  .getElementById(decodeURIComponent(href.slice(1)))
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                return
              }
              if (/^mailto:/i.test(href)) return
              const resolved = resolveLocalReference(documentPath, href)
              if (resolved) onOpenPath(resolved)
            }
            return (
              <a href={href} onClick={handleClick} title={href}>
                {children}
              </a>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}

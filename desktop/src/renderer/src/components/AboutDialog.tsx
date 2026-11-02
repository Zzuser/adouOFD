import { useEffect, useState } from 'react'
import type { AppVersions, BackendInfo, EngineHealth, LegalNotices } from '@shared/types'
import { messageOf } from '../api'
import mascotEmpty from '../assets/mascot-empty.webp'
import { IconClose, IconExternal } from './icons'

const REPOSITORY = 'https://gitcode.com/Zzuser/adouOFD'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
  backend: BackendInfo
  health: EngineHealth | null
  versions: AppVersions | null
}

type NoticeView = 'thirdParty' | 'license'

export function AboutDialog({ open, onClose, backend, health, versions }: AboutDialogProps) {
  const [notices, setNotices] = useState<LegalNotices | null>(null)
  const [noticeView, setNoticeView] = useState<NoticeView | null>(null)
  const [noticesError, setNoticesError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setNoticesError(null)
    void window.adou
      .readLegalNotices()
      .then((value) => {
        if (alive) setNotices(value)
      })
      .catch((reason: unknown) => {
        if (alive) setNoticesError(messageOf(reason))
      })
    return () => {
      alive = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (noticeView) {
        setNoticeView(null)
      } else {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, noticeView])

  useEffect(() => {
    if (!open) setNoticeView(null)
  }, [open])

  if (!open) return null

  const noticeText =
    noticeView === 'thirdParty' ? notices?.thirdParty : noticeView === 'license' ? notices?.license : null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="about-close" onClick={onClose} aria-label="关闭关于">
          <IconClose size={16} />
        </button>
        <img className="about-mascot" src={mascotEmpty} alt="阿豆" draggable={false} />
        <h2 id="about-title">阿豆OFD</h2>
        <div className="about-version">v{versions?.app ?? '0.7.1'} · MIT License</div>
        <p className="about-desc">本地 OFD / PDF 阅读与处理工具，文档不上传。</p>

        <div className="about-versions">
          <div><span>Java</span><b>{health?.javaVersion ?? '—'}</b></div>
          <div><span>ofdrw</span><b>{health?.ofdrwVersion ?? '—'}</b></div>
          <div><span>Spring Boot</span><b>{health?.springBootVersion ?? '—'}</b></div>
          <div><span>Electron</span><b>{versions?.electron ?? '—'}</b></div>
        </div>

        <div className="about-licenses" data-about-licenses>
          <div className="about-licenses-head">
            <span>开源许可</span>
            <span className="about-license-badge">MIT</span>
          </div>
          <p>
            阿豆OFD 基于 Electron、React、ofdrw、Apache PDFBox、Spring Boot 等开源组件构建。
            完整版权声明与许可文本随安装包提供。
          </p>
          <div className="about-license-tags">
            <span>Electron · MIT</span>
            <span>React · MIT</span>
            <span>ofdrw · MIT</span>
            <span>PDFBox · Apache-2.0</span>
            <span>Spring Boot · Apache-2.0</span>
            <span>Logback · EPL-2.0 / LGPL-2.1</span>
          </div>
          <div className="about-license-actions">
            <button
              className="btn ghost small"
              data-action="view-third-party"
              disabled={!notices}
              onClick={() => setNoticeView('thirdParty')}
            >
              第三方声明
            </button>
            <button
              className="btn ghost small"
              data-action="view-app-license"
              disabled={!notices}
              onClick={() => setNoticeView('license')}
            >
              MIT 许可
            </button>
            <button
              className="btn ghost small"
              data-action="reveal-licenses"
              onClick={() => {
                void window.adou
                  .revealLegalNotices()
                  .catch((reason: unknown) => setNoticesError(messageOf(reason)))
              }}
            >
              打开许可目录
            </button>
          </div>
          {noticesError ? <p className="about-license-error">{noticesError}</p> : null}
        </div>

        <div className="about-actions">
          <button
            className="btn primary"
            onClick={() => void window.adou.openExternal(REPOSITORY)}
          >
            <IconExternal size={16} />
            开源仓库
          </button>
          <button className="btn ghost" onClick={onClose}>关闭</button>
        </div>

        <p className="about-note">
          {backend.status === 'ready' ? '本地引擎运行中' : '本地引擎未就绪'}
          。第三方组件与许可文本随安装包提供。
        </p>
      </div>

      {noticeView ? (
        <div
          className="license-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNoticeView(null)
          }}
        >
          <div className="license-dialog" role="dialog" aria-modal="true">
            <div className="license-head">
              <h3>{noticeView === 'thirdParty' ? '第三方组件与许可声明' : '阿豆OFD MIT 许可'}</h3>
              <button
                className="license-close"
                data-action="license-close"
                aria-label="关闭许可"
                onClick={() => setNoticeView(null)}
              >
                <IconClose size={16} />
              </button>
            </div>
            <pre className="license-text">{noticeText ?? '正在读取许可文本…'}</pre>
          </div>
        </div>
      ) : null}
    </div>
  )
}

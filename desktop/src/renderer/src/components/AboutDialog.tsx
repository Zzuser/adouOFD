import { useEffect, useState } from 'react'
import type {
  AppVersions,
  BackendInfo,
  EngineHealth,
  LegalNotices,
  UpdateCheckResult,
  UpdateProgress
} from '@shared/types'
import { messageOf } from '../api'
import mascotEmpty from '../assets/mascot-empty.webp'
import { IconClose, IconExternal } from './icons'

const REPOSITORY = 'https://gitcode.com/Zzuser/adouOFD'

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

interface AboutDialogProps {
  open: boolean
  onClose: () => void
  backend: BackendInfo
  health: EngineHealth | null
  versions: AppVersions | null
}

type NoticeView = 'thirdParty' | 'license' | 'privacy'
type UpdateState = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'done' | 'error'

export function AboutDialog({ open, onClose, backend, health, versions }: AboutDialogProps) {
  const [notices, setNotices] = useState<LegalNotices | null>(null)
  const [noticeView, setNoticeView] = useState<NoticeView | null>(null)
  const [noticesError, setNoticesError] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null)

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

  useEffect(() => window.adou.onUpdateProgress(setUpdateProgress), [])

  const runUpdateCheck = async (): Promise<void> => {
    setUpdateState('checking')
    setUpdateError(null)
    setUpdateProgress(null)
    setDownloadedPath(null)
    try {
      const result = await window.adou.checkUpdate()
      setUpdateResult(result)
      if (result.error) {
        setUpdateError(result.error)
        setUpdateState('error')
      } else if (result.updateAvailable) {
        setUpdateState('available')
      } else {
        setUpdateState('latest')
      }
    } catch (reason) {
      setUpdateError(messageOf(reason))
      setUpdateState('error')
    }
  }

  const startUpdateDownload = async (): Promise<void> => {
    const download = updateResult?.download
    if (!download) return
    setUpdateState('downloading')
    setUpdateError(null)
    setUpdateProgress({ received: 0, total: download.size })
    try {
      const result = await window.adou.downloadUpdate(download)
      if (result.ok && result.path) {
        setDownloadedPath(result.path)
        setUpdateState('done')
      } else {
        setUpdateError(result.error ?? '下载失败')
        setUpdateState('error')
      }
    } catch (reason) {
      setUpdateError(messageOf(reason))
      setUpdateState('error')
    }
  }

  if (!open) return null

  const manifest = updateResult?.manifest ?? null
  const progressPercent =
    updateProgress && updateProgress.total > 0
      ? Math.min(100, Math.round((updateProgress.received / updateProgress.total) * 100))
      : 0

  const noticeText =
    noticeView === 'thirdParty'
      ? notices?.thirdParty
      : noticeView === 'license'
        ? notices?.license
        : noticeView === 'privacy'
          ? notices?.privacy
          : null

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
        <div className="about-version">v{versions?.app ?? '—'} · MIT License</div>
        <p className="about-desc">本地 OFD / PDF / Markdown 阅读与处理工具，文档不上传。</p>

        <div className="about-versions">
          <div><span>Java</span><b>{health?.javaVersion ?? '—'}</b></div>
          <div><span>ofdrw</span><b>{health?.ofdrwVersion ?? '—'}</b></div>
          <div><span>运行时</span><b>{health?.runtime ?? '—'}</b></div>
          <div><span>Electron</span><b>{versions?.electron ?? '—'}</b></div>
        </div>

        <div className="about-update" data-about-update data-update-state={updateState}>
          <div className="about-update-head">
            <span>版本更新</span>
            <button
              className="btn ghost small"
              data-action="check-update"
              disabled={updateState === 'checking' || updateState === 'downloading'}
              onClick={() => void runUpdateCheck()}
            >
              {updateState === 'checking' ? '检查中…' : '检查更新'}
            </button>
          </div>

          {updateState === 'latest' ? (
            <p className="about-update-ok">
              已是最新版本 v{updateResult?.currentVersion ?? versions?.app ?? '—'}
            </p>
          ) : null}

          {updateState === 'available' && manifest && updateResult?.download ? (
            <div className="about-update-card">
              <div className="about-update-title">
                <b>发现新版本 v{manifest.version}</b>
                {manifest.channel && manifest.channel !== 'stable' ? (
                  <span className="about-update-channel">
                    {manifest.channel === 'test' ? '测试通道' : manifest.channel}
                  </span>
                ) : null}
              </div>
              {manifest.notes.length > 0 ? (
                <ul className="about-update-notes">
                  {manifest.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : null}
              <div className="about-update-meta">
                {formatBytes(updateResult.download.size)} · SHA256 {updateResult.download.sha256.slice(0, 12)}…
              </div>
              <div className="about-update-actions">
                <button
                  className="btn primary small"
                  data-action="download-update"
                  onClick={() => void startUpdateDownload()}
                >
                  下载并校验
                </button>
                {manifest.notesUrl ? (
                  <button
                    className="btn ghost small"
                    onClick={() => void window.adou.openExternal(manifest.notesUrl ?? '')}
                  >
                    <IconExternal size={14} />
                    更新说明
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {updateState === 'downloading' && updateProgress ? (
            <div className="about-update-card">
              <div className="about-update-meta">
                正在下载 {formatBytes(updateProgress.received)} / {formatBytes(updateProgress.total)} · {progressPercent}%
              </div>
              <div className="about-update-progress">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="about-update-actions">
                <button
                  className="btn ghost small"
                  data-action="cancel-update"
                  onClick={() => void window.adou.cancelUpdateDownload()}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {updateState === 'done' && downloadedPath ? (
            <div className="about-update-card">
              <p className="about-update-ok">下载完成，SHA256 校验通过。</p>
              <p className="about-update-path" title={downloadedPath}>{downloadedPath}</p>
              <div className="about-update-actions">
                <button
                  className="btn ghost small"
                  data-action="reveal-update"
                  onClick={() => void window.adou.revealPath(downloadedPath)}
                >
                  打开所在文件夹
                </button>
              </div>
            </div>
          ) : null}

          {updateState === 'error' && updateError ? (
            <p className="about-update-error">{updateError}</p>
          ) : null}

          <p className="about-update-privacy">只请求版本清单，不上传文档或个人信息。</p>
        </div>

        <div className="about-licenses" data-about-licenses>
          <div className="about-licenses-head">
            <span>开源与隐私</span>
            <span className="about-license-badge">MIT</span>
          </div>
          <p>
            阿豆OFD 基于 Electron、React、ofdrw、Apache PDFBox、Javalin 等开源组件构建。
            完整版权声明、许可文本与隐私政策随安装包提供。
          </p>
          <div className="about-license-tags">
            <span>Electron · MIT</span>
            <span>React · MIT</span>
            <span>ofdrw · MIT</span>
            <span>PDFBox · Apache-2.0</span>
            <span>Javalin · Apache-2.0</span>
            <span>Jetty · Apache-2.0</span>
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
              data-action="view-privacy"
              disabled={!notices}
              onClick={() => setNoticeView('privacy')}
            >
              隐私政策
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
              <h3>
                {noticeView === 'thirdParty'
                  ? '第三方组件与许可声明'
                  : noticeView === 'license'
                    ? '阿豆OFD MIT 许可'
                    : '隐私政策'}
              </h3>
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

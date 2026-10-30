import { useEffect } from 'react'
import type { AppVersions, BackendInfo, EngineHealth } from '@shared/types'
import { BrandMark, IconClose, IconExternal } from './icons'

const REPOSITORY = 'https://gitcode.com/Zzuser/adouOFD'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
  backend: BackendInfo
  health: EngineHealth | null
  versions: AppVersions | null
}

export function AboutDialog({ open, onClose, backend, health, versions }: AboutDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

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
        <BrandMark size={58} />
        <h2 id="about-title">阿豆OFD</h2>
        <div className="about-version">v{versions?.app ?? '0.5.2'} · MIT License</div>
        <p className="about-desc">
          免费、离线的 OFD / PDF 查看与处理工具。文件只在本机处理，不上传、不联网。
        </p>

        <div className="about-versions">
          <div><span>Java</span><b>{health?.javaVersion ?? '—'}</b></div>
          <div><span>ofdrw</span><b>{health?.ofdrwVersion ?? '—'}</b></div>
          <div><span>Spring Boot</span><b>{health?.springBootVersion ?? '—'}</b></div>
          <div><span>Electron</span><b>{versions?.electron ?? '—'}</b></div>
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
          。第三方组件与许可说明见仓库 THIRD-PARTY-NOTICES.md。
        </p>
      </div>
    </div>
  )
}

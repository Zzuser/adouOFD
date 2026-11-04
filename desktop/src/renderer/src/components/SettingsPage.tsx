import { useEffect, useState, type ReactNode } from 'react'
import type { AppVersions } from '@shared/types'
import { IconFile, IconLocation, IconSettings, IconShield } from './icons'
import { WindowsIntegrationPanel } from './WindowsIntegrationPanel'

interface SettingsPageProps {
  recentCount: number
  onClearRecent: () => Promise<boolean>
  onCheckUpdate: () => void
}

function SectionHead({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="settings-section-head">
      <span className="settings-section-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="settings-section-copy">
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </div>
  )
}

export function SettingsPage({ recentCount, onClearRecent, onCheckUpdate }: SettingsPageProps) {
  const [versions, setVersions] = useState<AppVersions | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearFeedback, setClearFeedback] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.adou
      .getVersions()
      .then((value) => {
        if (alive) setVersions(value)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!clearFeedback) return
    const timer = setTimeout(() => setClearFeedback(null), 3000)
    return () => clearTimeout(timer)
  }, [clearFeedback])

  const clearRecent = async (): Promise<void> => {
    setClearing(true)
    const ok = await onClearRecent()
    setClearing(false)
    setConfirmClear(false)
    setClearFeedback(ok ? '最近文件记录已清除' : '清除失败，请稍后重试')
  }

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="settings-column">
          <section className="settings-card">
            <SectionHead
              icon={<IconFile size={18} />}
              title="文件关联"
              desc="把阿豆OFD 加入 .ofd / .pdf / .md 的“打开方式”，并使用独立文件图标。默认应用仍由 Windows 统一管理。"
            />
            <WindowsIntegrationPanel />
          </section>

          <section className="settings-card">
            <SectionHead
              icon={<IconShield size={18} />}
              title="本地与隐私"
              desc="文档处理全部在本机完成；应用只在你主动操作时联网。"
            />
            <div className="settings-facts">
              <div className="settings-fact">
                <span className="settings-fact-dot" aria-hidden="true" />
                <div>
                  <b>文档只在本机处理</b>
                  <p>转换、合并、拆分与搜索都在本地完成，不上传文件。</p>
                </div>
              </div>
              <div className="settings-fact">
                <span className="settings-fact-dot" aria-hidden="true" />
                <div>
                  <b>引擎仅监听本机</b>
                  <p>本地服务只监听 127.0.0.1，每次启动使用随机 Token。</p>
                </div>
              </div>
              <div className="settings-fact">
                <span className="settings-fact-dot" aria-hidden="true" />
                <div>
                  <b>源文件只读</b>
                  <p>转换与合并写入新文件，不修改原始文档。</p>
                </div>
              </div>
            </div>

            <div className="settings-data-row">
              <div className="settings-data-copy">
                <b>最近文件</b>
                <span>{recentCount > 0 ? `保留 ${recentCount} 个最近打开的文件` : '暂无最近文件记录'}</span>
              </div>
              {confirmClear ? (
                <div className="settings-inline-confirm">
                  <span>清除全部记录？不会删除文件。</span>
                  <button
                    className="btn ghost small"
                    data-action="cancel-clear-recent"
                    disabled={clearing}
                    onClick={() => setConfirmClear(false)}
                  >
                    取消
                  </button>
                  <button
                    className="btn danger small"
                    data-action="confirm-clear-recent"
                    disabled={clearing}
                    onClick={() => void clearRecent()}
                  >
                    {clearing ? '正在清除…' : '确认清除'}
                  </button>
                </div>
              ) : (
                <button
                  className="btn ghost small"
                  data-action="clear-recent"
                  disabled={recentCount === 0 || clearing}
                  onClick={() => setConfirmClear(true)}
                >
                  {clearing ? '正在清除…' : '清除记录'}
                </button>
              )}
            </div>
            {clearFeedback ? (
              <p className="settings-feedback" role="status">
                {clearFeedback}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="settings-column settings-column-side">
          <section className="settings-card settings-version-card">
            <SectionHead
              icon={<IconSettings size={18} />}
              title="版本与更新"
              desc="安装包从 CNB Release 下载，并在本地校验 SHA256。"
            />
            <dl className="settings-version-list">
              <div>
                <dt>当前版本</dt>
                <dd>v{versions?.app ?? '—'}</dd>
              </div>
              <div>
                <dt>更新来源</dt>
                <dd>CNB Release</dd>
              </div>
            </dl>
            <button
              className="btn primary settings-update-button"
              data-action="settings-check-update"
              onClick={onCheckUpdate}
            >
              检查更新
            </button>
            <p className="settings-note">
              <IconLocation size={13} />
              仅点击后联网，不发送文档或使用数据。
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { WindowsIntegrationStatus } from '@shared/types'
import { messageOf } from '../api'

export function WindowsIntegrationPanel() {
  const [status, setStatus] = useState<WindowsIntegrationStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    void window.adou
      .getWindowsIntegration()
      .then((value) => {
        if (alive) setStatus(value)
      })
      .catch((reason: unknown) => {
        if (alive) setError(messageOf(reason))
      })
    return () => {
      alive = false
    }
  }, [])

  const run = async (action: () => Promise<WindowsIntegrationStatus>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const remove = (): void => {
    if (
      !window.confirm(
        '移除后会从 Windows 的“打开方式”和默认应用设置中删除阿豆OFD。\n如果阿豆OFD仍是默认应用，请先在系统设置中更换。继续？'
      )
    ) {
      return
    }
    void run(() => window.adou.unregisterWindowsIntegration())
  }

  if (!status) {
    return (
      <div className="integration-panel" data-integration-panel>
        {error ? <p className="integration-error">{error}</p> : <p className="integration-note">正在读取 Windows 文件关联…</p>}
      </div>
    )
  }

  return (
    <div className="integration-panel" data-integration-panel data-registered={status.registered}>
      <div className="integration-head">
        <span>当前状态</span>
        <span className={`integration-state ${status.registered ? 'ok' : ''}`}>
          {status.registered ? '已注册' : '未注册'}
        </span>
      </div>
      <p>
        加入 .ofd / .pdf / .md 的“打开方式”和 Windows 默认应用列表；不会覆盖你已选择的 PDF
        默认应用。
      </p>
      <div className="integration-actions">
        <button
          className="btn ghost small"
          data-action="windows-register"
          disabled={!status.canRegister || busy}
          onClick={() => void run(() => window.adou.registerWindowsIntegration())}
        >
          注册 / 修复
        </button>
        <button
          className="btn ghost small"
          data-action="windows-default-choice"
          disabled={!status.registered || busy}
          onClick={() => {
            void (async () => {
              setBusy(true)
              setError(null)
              try {
                await window.adou.openDefaultAppChoice()
                setStatus(await window.adou.getWindowsIntegration())
              } catch (reason) {
                setError(messageOf(reason))
              } finally {
                setBusy(false)
              }
            })()
          }}
          title="选择 .ofd 的默认打开方式"
        >
          设为默认…
        </button>
        <button
          className="btn ghost small"
          data-action="windows-default"
          disabled={busy}
          onClick={() => {
            void window.adou
              .openDefaultAppsSettings()
              .catch((reason: unknown) => setError(messageOf(reason)))
          }}
        >
          系统设置
        </button>
        {status.registered ? (
          <button
            className="btn ghost small danger-text"
            data-action="windows-unregister"
            disabled={busy}
            onClick={remove}
          >
            移除
          </button>
        ) : null}
      </div>
      <p className="integration-note">
        {status.ofdDefault ? '.ofd：阿豆OFD' : '.ofd：等待系统确认'}
        {' · '}
        {status.pdfDefault ? '.pdf：阿豆OFD' : '.pdf：保持系统默认'}
        {' · '}
        {status.mdDefault ? '.md：阿豆OFD' : '.md：保持系统默认'}
        {status.optedOut ? ' · 已关闭自动注册' : ''}
      </p>
      {!status.canRegister ? (
        <p className="integration-note">开发模式不写入注册表；安装版启动时会自动注册。</p>
      ) : null}
      {error ? <p className="integration-error">{error}</p> : null}
    </div>
  )
}

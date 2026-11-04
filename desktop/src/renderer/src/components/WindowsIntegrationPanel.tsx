import { useEffect, useState } from 'react'
import type { WindowsIntegrationStatus } from '@shared/types'
import { messageOf } from '../api'
import { IconAlert } from './icons'

type Action = 'register' | 'default' | 'settings' | 'unregister'

export function WindowsIntegrationPanel() {
  const [status, setStatus] = useState<WindowsIntegrationStatus | null>(null)
  const [busyAction, setBusyAction] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

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
  }, [reloadKey])

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 3000)
    return () => clearTimeout(timer)
  }, [feedback])

  const run = async (
    action: Action,
    task: () => Promise<WindowsIntegrationStatus>,
    message: string
  ): Promise<void> => {
    setBusyAction(action)
    setError(null)
    setFeedback(null)
    try {
      setStatus(await task())
      setFeedback(message)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusyAction(null)
    }
  }

  const openSystemSettings = async (): Promise<void> => {
    setBusyAction('settings')
    setError(null)
    setFeedback(null)
    try {
      await window.adou.openDefaultAppsSettings()
      setFeedback('已打开 Windows 默认应用设置')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusyAction(null)
    }
  }

  const chooseDefault = (): void => {
    void run(
      'default',
      async () => {
        await window.adou.openDefaultAppChoice()
        return window.adou.getWindowsIntegration()
      },
      '已打开 .ofd 默认应用选择'
    )
  }

  const remove = (): void => {
    void run(
      'unregister',
      () => window.adou.unregisterWindowsIntegration(),
      '已移除文件关联'
    ).finally(() => setConfirmingRemove(false))
  }

  if (!status) {
    return (
      <div className="integration-panel" data-integration-panel aria-busy={!error}>
        {error ? (
          <div className="integration-load-error" role="alert">
            <span className="integration-error">
              <IconAlert size={14} />
              {error}
            </span>
            <button className="btn ghost small" onClick={() => setReloadKey((value) => value + 1)}>
              重新读取
            </button>
          </div>
        ) : (
          <>
            <div className="integration-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="integration-note">正在读取 Windows 文件关联…</p>
          </>
        )}
      </div>
    )
  }

  const extension = (ext: 'ofd' | 'pdf' | 'md'): { label: string; tone: string } => {
    if (!status.registered) return { label: '未注册', tone: 'muted' }
    const isDefault = ext === 'ofd' ? status.ofdDefault : ext === 'pdf' ? status.pdfDefault : status.mdDefault
    if (isDefault) return { label: '默认应用', tone: 'ok' }
    return { label: ext === 'ofd' ? '已加入' : '系统默认', tone: 'soft' }
  }

  return (
    <div className="integration-panel" data-integration-panel data-registered={status.registered}>
      <div className="integration-status">
        <span className={`integration-dot ${status.registered ? 'ok' : ''}`} aria-hidden="true" />
        <div className="integration-status-copy">
          <b>{status.registered ? '已加入 Windows 打开方式' : '尚未注册文件关联'}</b>
          <span>
            {status.registered
              ? '右键 .ofd / .pdf / .md 可直接选择阿豆OFD；默认应用仍由 Windows 管理。'
              : '注册后，.ofd / .pdf / .md 会出现在“打开方式”列表中。'}
          </span>
        </div>
        <span className={`integration-state ${status.registered ? 'ok' : ''}`}>
          {status.registered ? '已注册' : '未注册'}
        </span>
      </div>

      <div className="integration-extensions">
        {(['ofd', 'pdf', 'md'] as const).map((ext) => {
          const state = extension(ext)
          return (
            <span key={ext} className={`integration-chip ${state.tone}`}>
              <b>.{ext}</b>
              <span>{state.label}</span>
            </span>
          )
        })}
        {status.optedOut ? <span className="integration-chip muted">安装器自动注册已关闭</span> : null}
      </div>

      <div className="integration-actions">
        <button
          className="btn primary small"
          data-action="windows-register"
          disabled={!status.canRegister || busyAction !== null}
          onClick={() => void run('register', () => window.adou.registerWindowsIntegration(), '已注册文件关联')}
        >
          {busyAction === 'register' ? <span className="btn-spinner" /> : null}
          {busyAction === 'register' ? '正在注册…' : '注册 / 修复'}
        </button>
        <button
          className="btn ghost small"
          data-action="windows-default-choice"
          disabled={!status.registered || busyAction !== null}
          onClick={chooseDefault}
          title="选择 .ofd 的默认打开方式"
        >
          {busyAction === 'default' ? <span className="btn-spinner dark" /> : null}
          {busyAction === 'default' ? '正在打开…' : '设为默认…'}
        </button>
        <button
          className="btn ghost small"
          data-action="windows-default"
          disabled={busyAction !== null}
          onClick={() => void openSystemSettings()}
        >
          {busyAction === 'settings' ? <span className="btn-spinner dark" /> : null}
          {busyAction === 'settings' ? '正在打开…' : '系统设置'}
        </button>
        {status.registered ? (
          <button
            className="btn ghost small danger-text"
            data-action="windows-unregister"
            disabled={busyAction !== null}
            onClick={() => setConfirmingRemove(true)}
          >
            移除
          </button>
        ) : null}
      </div>

      {confirmingRemove ? (
        <div className="integration-confirm" role="alertdialog" aria-label="确认移除文件关联">
          <p>只从“打开方式”和默认应用列表中注销，不会删除任何文档。若阿豆OFD 是默认应用，请先在系统设置中更换。</p>
          <div className="integration-confirm-actions">
            <button
              className="btn ghost small"
              data-action="windows-cancel-remove"
              disabled={busyAction !== null}
              onClick={() => setConfirmingRemove(false)}
            >
              取消
            </button>
            <button className="btn danger small" data-action="windows-confirm-remove" disabled={busyAction !== null} onClick={remove}>
              {busyAction === 'unregister' ? <span className="btn-spinner" /> : null}
              {busyAction === 'unregister' ? '正在移除…' : '确认移除'}
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className="integration-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="integration-error" role="alert">
          <IconAlert size={14} />
          {error}
        </p>
      ) : null}
      {!status.canRegister ? (
        <p className="integration-note">开发模式不写入注册表；安装版启动时会自动注册。</p>
      ) : null}
    </div>
  )
}

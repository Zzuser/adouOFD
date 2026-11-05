import { useEffect, useState } from 'react'
import type { WindowsIntegrationStatus } from '@shared/types'
import { messageOf } from '../api'
import { IconAlert } from './icons'

type Action = 'register' | 'unregister'

interface WindowsIntegrationPanelProps {
  active: boolean
}

export function WindowsIntegrationPanel({ active }: WindowsIntegrationPanelProps) {
  const [status, setStatus] = useState<WindowsIntegrationStatus | null>(null)
  const [busyAction, setBusyAction] = useState<Action | null>(null)
  const [busyExtension, setBusyExtension] = useState<'ofd' | 'pdf' | 'md' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    const load = (): void => {
      setError(null)
      void window.adou
        .getWindowsIntegration()
        .then((value) => {
          if (alive) setStatus(value)
        })
        .catch((reason: unknown) => {
          if (alive) setError(messageOf(reason))
        })
    }
    load()
    if (!active) {
      return () => {
        alive = false
      }
    }
    // 进入设置页或从 Windows 设置返回时刷新，避免启动注册尚未完成导致的状态过期
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.removeEventListener('focus', load)
    }
  }, [active, reloadKey])

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

  const openAppDefaults = async (ext: 'ofd' | 'pdf' | 'md'): Promise<void> => {
    setBusyExtension(ext)
    setError(null)
    setFeedback(null)
    try {
      await window.adou.openAppDefaultSettings()
      setFeedback(`已打开默认应用设置，请将 .${ext} 设为阿豆OFD`)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusyExtension(null)
    }
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

  const extOpenWith = (ext: 'ofd' | 'pdf' | 'md'): boolean =>
    ext === 'ofd' ? status.ofdOpenWith : ext === 'pdf' ? status.pdfOpenWith : status.mdOpenWith

  const extIsDefault = (ext: 'ofd' | 'pdf' | 'md'): boolean =>
    ext === 'ofd' ? status.ofdDefault : ext === 'pdf' ? status.pdfDefault : status.mdDefault

  const missingExtensions = (['ofd', 'pdf', 'md'] as const)
    .filter((ext) => !extOpenWith(ext))
    .map((ext) => `.${ext}`)

  const extension = (ext: 'ofd' | 'pdf' | 'md'): { label: string; tone: string } => {
    if (!status.registered) return { label: '未注册', tone: 'muted' }
    if (!extOpenWith(ext)) return { label: '需修复', tone: 'muted' }
    if (extIsDefault(ext)) return { label: '默认应用', tone: 'ok' }
    return { label: ext === 'ofd' ? '已加入' : '系统默认', tone: 'soft' }
  }

  const busy = busyAction !== null || busyExtension !== null

  return (
    <div className="integration-panel" data-integration-panel data-registered={status.registered}>
      <div className="integration-status">
        <span className={`integration-dot ${status.registered ? 'ok' : ''}`} aria-hidden="true" />
        <div className="integration-status-copy">
          <b>
            {status.registered
              ? missingExtensions.length > 0
                ? '已注册，部分扩展需修复'
                : '已加入 Windows 打开方式'
              : '尚未注册文件关联'}
          </b>
          <span>
            {status.registered
              ? missingExtensions.length > 0
                ? `${missingExtensions.join('、')} 不在“打开方式”列表中，点“注册 / 修复”补回。`
                : '右键 .ofd / .pdf / .md 可直接选择阿豆OFD；默认应用仍由 Windows 管理。'
              : '注册后，.ofd / .pdf / .md 会出现在“打开方式”列表中。'}
          </span>
        </div>
        <span className={`integration-state ${status.registered ? 'ok' : ''}`}>
          {status.registered ? '已注册' : '未注册'}
        </span>
      </div>

      <div className="integration-defaults">
        <span className="integration-defaults-label">默认应用</span>
        {(['ofd', 'pdf', 'md'] as const).map((ext) => {
          const state = extension(ext)
          const available = status.registered && extOpenWith(ext)
          const isDefault = extIsDefault(ext)
          return (
            <div className="integration-default-row" key={ext}>
              <span className={`integration-chip ${state.tone}`}>
                <b>.{ext}</b>
                <span>{state.label}</span>
              </span>
              <button
                className="btn ghost small"
                data-action={`windows-default-${ext}`}
                disabled={!available || isDefault || busy}
                onClick={() => void openAppDefaults(ext)}
                title={
                  !available
                    ? '请先注册 / 修复文件关联'
                    : isDefault
                      ? `阿豆OFD 已是 .${ext} 的默认应用`
                      : `在 Windows 设置中将 .${ext} 设为阿豆OFD`
                }
              >
                {busyExtension === ext ? <span className="btn-spinner dark" /> : null}
                {busyExtension === ext ? '正在打开…' : isDefault ? '已是默认' : '设为默认'}
              </button>
            </div>
          )
        })}
      </div>
      {status.optedOut ? <p className="integration-note">安装器自动注册已关闭。</p> : null}

      <div className="integration-actions">
        <button
          className="btn primary small"
          data-action="windows-register"
          disabled={busy}
          onClick={() => {
            if (!status.canRegister) {
              setError('开发模式不写入注册表，请使用安装版执行修复')
              setFeedback(null)
              return
            }
            void run('register', () => window.adou.registerWindowsIntegration(), '已注册文件关联')
          }}
        >
          {busyAction === 'register' ? <span className="btn-spinner" /> : null}
          {busyAction === 'register' ? '正在注册…' : '注册 / 修复'}
        </button>
        {status.registered ? (
          <button
            className="btn ghost small danger-text"
            data-action="windows-unregister"
            disabled={busy}
            onClick={() => setConfirmingRemove(true)}
          >
            移除
          </button>
        ) : null}
      </div>

      <p className="integration-note">
        Windows 不允许应用静默修改默认应用。点任一“设为默认”会打开本应用的默认应用页，请按扩展逐项确认。
      </p>

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

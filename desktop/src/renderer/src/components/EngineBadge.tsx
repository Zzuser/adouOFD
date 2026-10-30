import type { BackendInfo } from '@shared/types'

interface EngineBadgeProps {
  backend: BackendInfo
  onRetry: () => void
}

const LABELS: Record<BackendInfo['status'], string> = {
  starting: '引擎启动中',
  ready: '本地引擎已就绪',
  error: '引擎启动失败',
  stopped: '引擎已停止'
}

export function EngineBadge({ backend, onRetry }: EngineBadgeProps) {
  return (
    <div className={`engine-badge ${backend.status}`} role="status">
      {backend.status === 'starting' ? (
        <span className="mini-spinner" />
      ) : (
        <span className="status-dot" />
      )}
      <span>{LABELS[backend.status]}</span>
      {backend.status === 'error' ? (
        <button className="badge-retry" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}

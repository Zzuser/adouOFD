import type { BackendInfo } from '@shared/types'
import {
  BrandMark,
  IconChevronLeft,
  IconChevronRight,
  IconInfo,
  IconView
} from './icons'

interface SidebarProps {
  backend: BackendInfo
  collapsed: boolean
  onToggle: () => void
  appVersion?: string | null
  onAbout: () => void
  onRetry: () => void
}

const STATUS_TEXT: Record<BackendInfo['status'], string> = {
  starting: '本地引擎启动中',
  ready: '本地引擎已就绪',
  error: '本地引擎异常',
  stopped: '本地引擎已停止'
}

export function Sidebar({
  backend,
  collapsed,
  onToggle,
  appVersion,
  onAbout,
  onRetry
}: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <BrandMark size={42} className="brand-mark" />
        <div className="brand-text">
          <div className="brand-name">
            阿豆<em>OFD</em>
          </div>
          <div className="brand-sub">Local document toolkit</div>
        </div>
        <button
          className="sidebar-toggle"
          data-action="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? '展开导航' : '收起导航'}
          aria-label={collapsed ? '展开导航' : '收起导航'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <IconChevronRight size={15} /> : <IconChevronLeft size={15} />}
        </button>
      </div>

      <nav className="nav" aria-label="主导航">
        <div className="nav-item active" title="文档查看">
          <IconView size={18} />
          <span>文档查看</span>
        </div>
        <button
          className="nav-item nav-button"
          data-action="about"
          onClick={onAbout}
          title="关于阿豆OFD"
        >
          <IconInfo size={18} />
          <span>关于</span>
        </button>
      </nav>

      <div className={`engine-mini ${backend.status}`} title={STATUS_TEXT[backend.status]}>
        <span className="status-dot" />
        {!collapsed ? <span>{STATUS_TEXT[backend.status]}</span> : null}
        {!collapsed && backend.status === 'error' ? (
          <button className="engine-mini-retry" onClick={onRetry}>重试</button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="sidebar-foot">
          <span>v{appVersion ?? '0.5.2'}</span>
          <span>MIT</span>
        </div>
      ) : null}
    </aside>
  )
}

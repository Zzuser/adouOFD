import { WindowsIntegrationPanel } from './WindowsIntegrationPanel'

export function SettingsPage() {
  return (
    <div className="settings-page">
      <section className="settings-card">
        <h2>Windows 文件关联</h2>
        <p className="settings-desc">
          安装版会把阿豆OFD加入 .ofd / .pdf 的“打开方式”，并使用独立的文件图标。默认应用由
          Windows 统一管理，可在这里或系统设置中调整。
        </p>
        <WindowsIntegrationPanel />
      </section>

      <section className="settings-card">
        <h2>本地与隐私</h2>
        <p className="settings-desc">
          所有文档处理都在本机完成，不上传、不联网。本地引擎只监听 127.0.0.1，每次启动使用随机
          Token；转换、合并与搜索均不会修改源文件。
        </p>
      </section>
    </div>
  )
}

# 阿豆OFD 1.1.3

## 重点变化

- 维护版本，界面与功能无变化。
- 更新下载链路兼容 CNB Release 镜像，为后续切换到国内下载源做准备；本版本仍从 MinIO 主源检查和下载更新。
- GitHub 构建的安装包现在会同步发布到 CNB Release，提供 GitHub 之外的下载镜像。

## 升级说明

- 1.1.2 及以后：关于 → 检查更新 → 下载并校验 → 运行安装包。
- 覆盖安装保留设置、最近文件与既有文件关联。
- 安装包未签名，Windows SmartScreen 可能提示“未知发布者”；请以发布页/应用内显示的 SHA256 为准。

## 验证

- 后端 68 项测试通过；前端 typecheck/build 通过。
- 安装包由 GitHub Actions 构建，发布后同步到 GitHub Release 与 CNB Release。

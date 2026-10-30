# 阿豆OFD

<p align="center">
  <img src="docs/screenshots/icon.png" width="96" alt="阿豆OFD 图标">
</p>

<p align="center">
  <strong>免费、离线的 OFD / PDF 桌面阅读与处理工具</strong><br>
  看得清 · 复制得了 · 转得稳 · 合得准 · 拆得开
</p>

<p align="center">
  <a href="LICENSE">MIT License</a> ·
  Electron 45.1.0 · Java 25 LTS · ofdrw 2.3.7 · PDFBox 2.0.27
</p>

> 仓库：<https://gitcode.com/Zzuser/adouOFD>  
> 当前版本：**0.5.2**（M0 + M1.1 预览增强 + PDF + 目录 + 文字选择）

## 功能

- **OFD / PDF 查看**：本地打开、拖拽或内置示例，电子发票、公文、合同均可阅读
- **连续多页预览**：页面按需渲染，大文档滚动不一次性加载全部高清图
- **缩略图 + 目录**：缩略图高亮跳页；PDF Outline、OFD Outlines/Bookmarks 目录跳页并高亮当前章节
- **缩放**：50%–300%、适合宽度、适合页面、Ctrl+滚轮，页面清晰可读
- **页码与快捷键**：页码输入、上一页/下一页、←/→
- **文字选择复制**：逐字文字层，框选复制保留换行；右键选区弹出原生“复制”菜单
- **选区防误选**：拖出文字/页面边界时自动钳制，不会整页选中
- **PDF 友好处理**：页面旋转、加密 PDF 提示，扫描件按图显示
- **纯本地、离线**：文件不离开本机；不登录、不联网、无广告
- **应用导航折叠**：侧栏可收起为图标栏，阅读区自适应

## 界面

| 空状态 | 关于 |
| --- | --- |
| ![空状态](docs/screenshots/empty.png) | ![关于](docs/screenshots/about.png) |

| OFD 多页预览 | PDF 预览 |
| --- | --- |
| ![OFD 预览](docs/screenshots/viewer.png) | ![PDF 预览](docs/screenshots/pdf-viewer.png) |

更多：[目录页签](docs/screenshots/outline.png) · [OFD 文字选择](docs/screenshots/text-selection.png) · [PDF 文字选择](docs/screenshots/pdf-text-selection.png) · [侧栏折叠](docs/screenshots/sidebar-collapsed.png) · [800 页压力测试](docs/screenshots/stress-800p.png)

## 下载与安装

仓库只包含源码。预编译安装包体积较大（约 272MB，内含 JRE 25），暂未随仓库提交；可按下述步骤本地构建，后续通过 Releases 提供：

```powershell
cd desktop
npm run package:win
```

产物：`desktop/dist/阿豆OFD-<version>-x64.exe`（NSIS，按用户安装，无需管理员）。当前安装包未代码签名，Windows SmartScreen 可能提示“未知发布者”。

## 快速开始

**环境要求**

- Windows 10/11 x64
- Node.js ≥ 22.12（推荐 24 LTS）
- Maven 3.9.x

**准备项目内 JDK（不修改系统环境）**

```powershell
node scripts/setup-jdk.mjs
```

**安装依赖并启动**

```powershell
cd desktop
npm install
npm run backend:build
npm run dev
```

也可以一步完成引擎构建与启动：

```powershell
cd desktop
npm run dev:all
```

应用启动后会自动拉起本地 Java 引擎（随机端口 + 每次启动随机 Token），主界面显示引擎状态；版本与依赖信息在左侧“关于”中查看。

## 使用

| 操作 | 方式 |
| --- | --- |
| 打开文档 | “打开文档”、拖拽文件到窗口 |
| 查看示例 | “OFD 示例 / PDF 示例” |
| 翻页 | 顶部页码输入、‹ ›、`←` / `→` |
| 缩放 | 底部工具条、`Ctrl` + `+/-`、`Ctrl + 0` 适合宽度、`Ctrl + 滚轮` |
| 导航 | “导航”打开缩略图 / 目录页签 |
| 复制文字 | 在页面上框选后 `Ctrl+C`，或右键选择“复制选中文字” |
| 收起侧栏 | 左上角折叠按钮；状态会记住 |

## 架构

```text
Electron 主进程
  ├─ 窗口 / 原生对话框 / 右键菜单 / 打开外链
  └─ 启动 Java sidecar：127.0.0.1 + 随机端口 + 随机 Token
          │ HTTP (JSON / PNG)
          ▼
React 渲染进程 ────────────────► Java 引擎（Spring Boot 4）
  • 连续滚动、缩略图、目录        • OFD：ofdrw Reader / ImageMaker
  • 缩放、页码、逐字文字层        • PDF：PDFBox PDDocument / PDFRenderer
  • 选区钳制、右键复制            • 目录、渲染缓存、会话管理
```

**技术栈**

| 层 | 组件 |
| --- | --- |
| 桌面 | Electron 45.1.0、electron-vite 6.0.0、electron-builder 26.18.0 |
| 前端 | React 19.3.1、TypeScript 7.0.2、Vite 8.3.5 |
| 运行时 | Temurin JDK 25.0.5 LTS（项目内 `.tools/jdk-25`） |
| 引擎 | Spring Boot 4.0.9、ofdrw-full 2.3.7、PDFBox 2.0.27 |
| 构建 | Maven 3.9.16、Node.js 24 LTS |

## 目录

```text
adouOFD/
├─ backend/                 Java 本地引擎（Spring Boot + ofdrw + PDFBox）
├─ desktop/                 Electron + React + TypeScript
├─ docs/PRD.md              产品与技术设计
├─ docs/STRESS-TEST.md      大文件压力测试报告
├─ docs/screenshots/        界面截图
├─ scripts/                 环境、构建、冒烟、压测脚本
├─ LICENSE                  MIT
├─ THIRD-PARTY-NOTICES.md   第三方组件许可说明
└─ README.md
```

## 测试与压测

```powershell
# 后端测试（9 个用例）
cd backend
$env:JAVA_HOME="../.tools/jdk-25"
mvn test

# UI 冒烟（真实 Electron + Java 引擎）
cd ..\desktop
npm run build
npm run smoke:ui

# 大文件压力测试
npm run stress:fixtures
npm run stress:backend
npm run stress:ui
```

压力夹具：800 页矢量 PDF、100 页约 20MB 图片 PDF、91 页 OFD。结果见 [docs/STRESS-TEST.md](docs/STRESS-TEST.md)。

## 隐私

- 所有文档处理都在本机完成，不上传、不联网
- 本地引擎仅监听 `127.0.0.1`，每次启动随机 Token
- 不收集遥测；仅“开源仓库”按钮会主动打开浏览器
- 用户原文件只读，转换/合并/拆分默认写入新文件

## 路线图

- **M1.2**：全文搜索、页面旋转、最近文件、文件关联
- **M2**：PDF ↔ OFD 转换、批量任务与进度
- **M3**：OFD 合并 / 拆分
- **M4**：代码签名、jlink 裁剪（目标安装包 <150MB）、自动更新

## 已知限制

- 扫描件 PDF/OFD 无文本层，只能按图像查看
- OFD 竖排、带复杂 CTM 旋转的文字层仍需适配；PDF 多栏阅读顺序依赖 PDFBox
- 加密 PDF 暂不支持打开
- 超大文档（1000+ 页 / 100MB+）尚未压测；页面与缩略图 DOM 会随浏览增长
- 安装包未签名；安装包内置完整 JDK，体积较大

## 参与贡献

欢迎提交 Issue / Pull Request：

- 仓库：<https://gitcode.com/Zzuser/adouOFD>
- 提交前请运行后端测试、`npm run typecheck` 与 `npm run smoke:ui`
- 不要提交用户文档、真实发票、密钥或大体积安装包

## 许可

应用代码以 [MIT License](LICENSE) 发布。第三方组件许可、特别是 ofdrw-converter 传递依赖的 iText AGPL-3.0 说明，请阅读 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。公开发布二进制安装包前需完成相应许可合规处理。

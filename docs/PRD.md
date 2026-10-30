# 阿豆OFD — 产品与技术设计 PRD

| 项目 | 内容 |
| --- | --- |
| 产品名称 | 阿豆OFD（ADou OFD） |
| 文档版本 | v0.5.2（M0 + M1.1 预览增强 + PDF + 目录/折叠 + 逐字选择 + 压测） |
| 日期 | 2026-10-30 |
| 阶段 | M0 已完成；M1.1 多页预览、缩略图、缩放、PDF、目录、导航折叠、文字选择已交付 |
| 形态 | Windows 桌面软件（Electron 壳 + Java 本地引擎），后续扩展 macOS |
| 许可 | 应用免费；第三方依赖许可见 §11 |

---

## 1. 产品概述

### 1.1 一句话定位

**免费、离线、可安装的 OFD / PDF 桌面工具**：看得清、转得稳、合得准、拆得开。

### 1.2 背景与痛点

OFD（GB/T 33190）是电子发票、公文、电子档案的国产版式文档格式，但桌面端长期存在三个问题：

1. **免费查看器少**：不少工具带广告、会员、页数限制，或强制上传云端。
2. **格式互转门槛高**：OFD 与 PDF 互转工具多为在线服务，发票、公文涉密，不适合上传。
3. **合并/拆分能力分散**：批量报销、归档场景需要把多张发票合并为一个 OFD，或按页拆分，现成免费工具稀缺。

### 1.3 目标用户

- **财务/行政人员**：批量查看、合并电子发票，按报销单归档。
- **公文/档案工作者**：OFD 与 PDF 互转、拆分归档。
- **开发者/技术用户**：需要一个可离线、可脚本化、无广告的 OFD 工具。

### 1.4 价值主张

- **隐私**：100% 本地处理，不联网、不上传。
- **免费**：无广告、无会员、无页数限制。
- **可安装**：独立安装包，自带 JRE，用户无需安装 Java。
- **够快**：本地引擎按需渲染，首屏秒开，大文档分页加载。

---

## 2. 范围与里程碑

### 2.1 M0（已完成）

- 产品与技术 PRD（本文档）。
- 双端脚手架：Electron + React + TypeScript / Java 25 + Spring Boot + ofdrw。
- 本地 Java 引擎的启动、健康检查、优雅退出。
- **Hello World 纵向切片**：
  - 打开本地 OFD 文件；
  - 读取页数、页面尺寸、签名标记；
  - 渲染并展示页面（支持翻页）；
  - 内置示例文档，无样例文件也可体验；
  - UI 中展示 Java / ofdrw / Spring Boot 版本，证明引擎真实可用。
- 可重复的构建/启动脚本与冒烟测试。

> M0 不追求功能完整，目标是**打通“界面 → 本地引擎 → ofdrw → 页面回显”全链路**，并验证最新稳定工具链的兼容性。

### 2.2 M1.1（已完成）与 M1.2（待办）

**已完成：预览增强**

- 连续多页滚动，页面按需渲染、懒加载与缓存。
- 左侧缩略图栏：当前页高亮、点击跳页、多页快速定位。
- 缩放：50%–300% 预设、适合宽度、适合页面、Ctrl+滚轮、按钮步进。
- 页码输入跳转、上一页/下一页、←/→ 快捷键。
- 页面渲染失败单页隔离，不阻塞其他页面。
- **PDF 预览**：打开 PDF、页数/尺寸（含旋转）、按 DPI 渲染、缩略图、连续滚动、缩放；加密 PDF 友好提示；内置 PDF 示例。
- **文档目录**：阅读器导航面板“缩略图 / 目录”双页签；PDF Outline、OFD Outlines/Bookmarks 解析为扁平层级目录，点击跳页并高亮当前章节。
- **应用导航折叠**：左侧应用导航可收起为图标栏，阅读区自适应；折叠状态持久化。
- **文字选择/复制**：逐字文字层，支持框选、跨行复制并保留换行；右键选区弹出原生复制菜单；拖出文字/页面时钳制到最后一个有效字形，避免整页误选。
- **压力测试**：800 页矢量 PDF、100 页/20MB 图片 PDF、91 页 OFD；引擎与 UI 打开/跳页/缩略图/目录压测通过，详见 `docs/STRESS-TEST.md`。

**M1.2 待办：完整阅读器**

- 文本选择与复制、全文搜索。
- 页面旋转、文档属性与签章面板。
- 最近打开、拖拽打开全屏、文件关联（双击 .ofd 打开）。
- 大文档内存上限与页面卸载策略。

### 2.3 M2：格式转换

- OFD → PDF（优先 PDFBox 实现，规避 iText 许可风险）。
- PDF → OFD（保留页面尺寸、图片、基础文本；扫描件按图片嵌入）。
- 批量转换、进度、失败重试、输出目录记忆。
- 转换质量报告（字体替换、图片压缩、页数校验）。

### 2.4 M3：合并与拆分

- 多 OFD 合并（可调顺序、页码区间）。
- OFD 按页/按区间拆分，支持批量命名规则。
- 合并/拆分后完整性校验（页数、页面尺寸）。

### 2.5 M4：安装与发布

- Windows NSIS 安装包、便携版 ZIP。
- 应用图标、文件关联、开始菜单、卸载清理。
- 自动更新（可选，默认关闭）、崩溃日志与一键导出诊断信息。

### 2.6 非目标（当前不做）

- 在线协作、云存储、账号体系。
- OFD 编辑（改文字、改版面）与签章制作。
- 移动端。
- 打印驱动/虚拟打印机。

---

## 3. 技术栈与版本锁定

> 原则：**最新稳定版优先，兼容性以冒烟测试为准**。所有运行时依赖由项目自带，不依赖用户环境。

| 层 | 选型 | 版本 | 说明 |
| --- | --- | --- | --- |
| 桌面壳 | Electron | 45.1.0 | 当前稳定版，内置 Chromium/Node |
| 构建 | electron-vite | 6.0.0 | 主进程/预加载/渲染进程统一构建 |
| 前端 | React + TypeScript | 19.3.1 / 7.0.2 | 函数组件 + 严格类型 |
| 构建 | Vite | 8.3.5 | 渲染进程开发服务器与产物构建 |
| 打包 | electron-builder | 26.18.0 | NSIS 安装包 / 便携版 |
| 运行时 | Eclipse Temurin JDK | **25.0.5+8 LTS** | 项目内 `.tools/jdk-25`，发布时 jlink 裁剪 |
| 框架 | Spring Boot | 4.0.9 | 仅作为本地 HTTP 引擎，绑定 127.0.0.1 |
| OFD 核心 | ofdrw-full | **2.3.7** | Maven Central 最新稳定版（2025-06），Java 8 字节码 |
| PDF 渲染 | Apache PDFBox | **2.0.27** | 与 ofdrw-converter 内置版本对齐；Apache-2.0 |
| 构建 | Maven | 3.9.16 | 最新稳定 3.9 线；Maven 4 仍为 RC |
| 开发 Node | Node.js | 24.13.0 LTS | 仅构建期使用，不随应用分发 |

### 3.1 版本选择依据

- **ofdrw 2.3.7**：Maven Central 最新稳定版；`ofdrw-full` 聚合 reader / converter / layout / tool 等模块，覆盖查看、转 PDF、PDF 转 OFD、合并。
- **PDFBox 2.0.27**：显式锁定，与 ofdrw-converter 使用的版本一致；用于 PDF 页数/页面尺寸/渲染与 PDF 示例生成，避免 PDFBox 3.x API 不兼容。
- **JDK 25 LTS**：当前最新 LTS。ofdrw 以 Java 8 目标编译，需在 JDK 25 上实际验证 AWT 渲染、PDFBox、字体加载链路；M0 已完成示例生成、页面渲染、OFD→PDF、PDF→OFD 往返测试，真实发票渲染与 JDK 21 输出字节级一致（见 §13）。
- **Spring Boot 4.0.9**：当前最新稳定版，运行于 JDK 25；仅使用 Web/JSON 能力，不引入数据库与安全框架。
- **Electron 45.1.0**：当前稳定版；使用 `contextIsolation + sandbox + 禁用 nodeIntegration` 的安全基线。

### 3.2 兼容性策略

若某一“最新稳定版”与 ofdrw 不兼容：

1. 先降 JDK 到上一 LTS（21.0.x 最新补丁），保持 ofdrw 2.3.7；
2. 再考虑降 Spring Boot 到 3.5.x 最新补丁；
3. 任何降级必须在本文件 §13 记录原因、验证用例与结论，不允许静默降级。

---

## 4. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│ Electron 主进程 (Node)                                       │
│  · 创建窗口 / 原生文件对话框 / 最近文件                        │
│  · 启动 Java sidecar：随机端口 + 每次启动随机 Token             │
│  · 健康检查、日志落盘、退出时终止子进程                         │
└───────────────┬─────────────────────────────┬───────────────┘
                │ IPC (contextBridge 白名单)    │ HTTP 127.0.0.1
┌───────────────▼─────────────┐   ┌───────────▼───────────────┐
│ 渲染进程 (React + TS)        │   │ Java 本地引擎              │
│  · 文档导航 / 预览 / 工具栏   │   │ Spring Boot 4 + ofdrw 2.3.7│
│  · 仅通过 preload API 触达系统│   │ · 解析 / 渲染 / 转换 / 合并 │
└──────────────────────────────┘   │ · 会话与临时文件管理        │
                                   └───────────────────────────┘
```

### 4.1 为什么是“Electron + Java sidecar”

- ofdrw 是成熟稳定的 Java 库，重写 OFD 渲染/转换的成本与风险不可接受。
- 本地 HTTP 引擎比 JNI 更易调试、可独立测试、可替换 UI（未来可接 Web 管理端）。
- Electron 提供成熟的桌面壳、安装器与 Web UI 生态。

### 4.2 进程与通信

1. Electron 启动时选择一个空闲端口（`net.Server.listen(0)`）。
2. 生成 32 字节随机 Token，通过命令行参数传给 Java 进程：
   `java -jar adou-ofd-backend.jar --server.port=<port> --adou.token=<token>`
3. Java 仅绑定 `127.0.0.1`；所有 `/api/**` 请求校验 `X-ADou-Token` 或 `?token=`。
4. Electron 轮询 `/api/health` 直到就绪（最长 40s），期间 UI 显示“引擎启动中”。
5. 页面图片通过带 Token 的 URL 加载：`/api/documents/{id}/pages/{n}?dpi=144&token=...`。
6. 退出时先请求优雅关闭，超时后 `taskkill /T /F` 兜底，确保无残留 java 进程。

> 安全边界：Token 防止本机其他网页/进程随意调用引擎；服务只监听回环地址；输出文件路径必须来自原生保存对话框或用户拖拽。P1 将把页面图片改为自定义协议或 IPC 流，避免 Token 出现在 URL。

### 4.3 目录与数据

- 应用数据：`%APPDATA%/adou-ofd/`（Electron `userData`）
  - `logs/backend.log`：引擎 stdout/stderr。
  - `cache/pages/`：页面渲染缓存（后续版本，带容量上限）。
  - `config.json`：窗口尺寸、最近文件、输出目录偏好。
- 文档会话：Java 侧内存会话 + 系统临时目录。关闭文档或退出时删除临时文件。
- 用户文档**永不修改**；所有转换/合并/拆分默认写入新文件。

---

## 5. 后端设计（Java）

### 5.1 模块职责

| 包 | 职责 |
| --- | --- |
| `config` | Token 过滤器、CORS、Jackson/错误处理、优雅关闭 |
| `document` | 打开 OFD/PDF、元数据、会话管理、页面渲染与缓存 |
| `demo` | 生成内置示例 OFD / PDF（用于首启体验与自动化测试） |
| `convert` (M2) | OFD↔PDF 转换任务 |
| `merge` (M3) | 合并、拆分任务 |
| `job` (M2) | 单线程/有限并发任务队列、进度查询 |

### 5.2 会话模型

```java
DocumentSession {
  String id;            // UUID
  Path path;            // 原始文件或临时示例
  String name;
  long size;
  String kind;          // OFD / PDF
  int pageCount;
  List<PageMeta> pages; // 宽高（mm）、旋转
  boolean signed;
  Path workDir;         // 每会话临时目录
  boolean demo;         // 示例文档，关闭时删除
  DocumentHandle handle; // OFD/PDF 会话句柄，持有解析器与渲染缓存
}

DocumentHandle {
  int pageCount();
  List<PageMeta> pages();
  boolean signed();
  List<OutlineItem> outline(); // title + page + level
  Path render(int page, int dpi);
  void close();
}
```

- OFD 句柄持有 `OFDReader` 与按 DPI 缓存的 `ImageMaker`，避免每页重复解析 OFD 包。
- PDF 句柄持有 `PDDocument` / `PDFRenderer`；渲染串行化，保证 PDFBox 线程安全。
- 同一进程内最多保留 8 个会话；超出按最近最少使用关闭。
- 渲染按 `page + dpi` 缓存 PNG；同一会话渲染串行化，避免字体加载竞争。
- 页面索引：API 对外 **1-based**，ofdrw / PDFBox 内部 **0-based**，转换只在一处发生。
- 关闭会话时先关闭文档句柄，再删除临时目录。

### 5.3 渲染参数

- 默认页面预览 `dpi=144`；OFD 使用 `ppm = dpi / 25.4` 传给 `ImageExporter`。
- 允许范围 24–300；缩略图使用 24 DPI，主页面按缩放级别选择 96–300 DPI。
- OFD 使用 `ImageExporter(path, outDir, "PNG", ppm).export(pageIndex)`；PDF 使用 `PDFRenderer.renderImageWithDPI(pageIndex, dpi, RGB)`。
- PDF 页面渲染限制最长边 ≤12000px，避免超大页面耗尽内存；超出时自动降低实际 DPI。
- 输出文件按会话/页码/dpi 隔离目录后回传字节。
- 页面响应使用 `Cache-Control: private, max-age=300`，缩放与缩略图可复用浏览器/引擎缓存。

### 5.4 当前 API

统一响应：成功返回资源 JSON；失败返回
`{ "code": "DOCUMENT_PARSE_ERROR", "message": "可读的中文说明", "detail": "可选" }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 引擎状态与版本；需 Token |
| POST | `/api/documents/open` | `{ "path": "..." }` 打开 OFD 或 PDF |
| POST | `/api/documents/demo` | 生成并打开内置 OFD 示例 |
| POST | `/api/documents/demo/pdf` | 生成并打开内置 PDF 示例 |
| GET | `/api/documents/{id}` | 会话元数据 |
| GET | `/api/documents/{id}/outline` | 文档目录：`[{ title, page, level }]`，无目录返回空数组 |
| GET | `/api/documents/{id}/pages/{page}` | 渲染页面 PNG，`page` 从 1 开始，`dpi` 可选 |
| GET | `/api/documents/{id}/pages/{page}/text` | 页面可选文字层：`[{ text,x,y,width,height,fontSize }]`（归一化坐标） |
| DELETE | `/api/documents/{id}` | 关闭会话并清理临时文件 |
| POST | `/api/system/shutdown` | 优雅关闭（供 Electron 调用） |

`open` 响应示例：

```json
{
  "id": "0f7c...",
  "name": "示例发票.ofd",
  "path": "F:\\...\\示例发票.ofd",
  "size": 482133,
  "kind": "OFD",
  "pageCount": 2,
  "signed": true,
  "demo": false,
  "pages": [{ "index": 1, "widthMm": 210.0, "heightMm": 297.0 }]
}
```

错误码：

| code | HTTP | 场景 |
| --- | --- | --- |
| `FILE_NOT_FOUND` | 404 | 路径不存在 |
| `UNSUPPORTED_FORMAT` | 415 | 非 .ofd / .pdf |
| `DOCUMENT_PARSE_ERROR` | 422 | 文档损坏或不支持的特性 |
| `PDF_ENCRYPTED` | 422 | PDF 已加密，暂不支持打开 |
| `PAGE_OUT_OF_RANGE` | 400 | 页码越界 |
| `UNAUTHORIZED` | 401 | Token 缺失/错误 |
| `INTERNAL_ERROR` | 500 | 未预期异常 |

### 5.5 转换、合并、拆分 API（M2/M3 预留）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/conversions` | `{ documentId?, sourcePath?, target: "PDF"/"OFD", outputPath }` |
| POST | `/api/merge` | `{ documentIds: [], outputPath }` |
| POST | `/api/split` | `{ documentId, ranges: [{from,to}], outputDir, namePattern }` |
| GET | `/api/jobs/{id}` | `{ status, progress, message, outputs[] }` |
| POST | `/api/jobs/{id}/cancel` | 取消排队/执行中的任务 |

长任务统一进入**单工作线程 + 有界队列**：ofdrw 转换吃 CPU/内存，并发会拖垮桌面体验；进度以 5% 粒度上报。

### 5.6 关键实现选型

- **OFD 读取**：`OFDReader` → `getNumberOfPages()` / `getPageSize(int)` / `hasSignature()`。
- **OFD 页面渲染**：`ImageExporter`（ofdrw-converter），PNG。
- **PDF 读取/渲染**：PDFBox 2.0.27 `PDDocument` + `PDFRenderer`；CropBox/MediaBox 与页面旋转参与尺寸计算；签名通过 `getSignatureDictionaries()` 检测。
- **PDF 安全**：加密 PDF 捕获 `InvalidPasswordException` 返回 `PDF_ENCRYPTED`；渲染最长边 12000px 上限。
- **逐字文字层**：PDF 使用每个 `TextPosition` 的字形框；OFD 使用 `TextObject` 边界、`TextCode` 的 X/Y 与 `DeltaX` 推进逐字位置；按基线变化插入换行。坐标/字号归一化后前端逐字叠加，选区随字形与字号对齐，并处理 PDF 页面旋转。扫描件无文本层。
- **目录提取**：
  - PDF：`PDDocumentOutline` 递归遍历，`PDOutlineItem.findDestinationPage()` 解析页码，层级扁平化为 level。
  - OFD：`Document.getOutlines()` 递归（Actions → Goto → Dest → PageID 映射页码）；无 Outlines 时回退 `getBookmarks()`。
  - 目录条目上限 5000，深度上限 20，损坏目录不影响页面预览。
- **OFD→PDF**：`PDFExporterPDFBox`（Apache PDFBox 2.0.x），不采用 iText 实现。
- **PDF→OFD**：`PDFConverter`（基于 PDFBox 解析，输出 OFD）。
- **合并**：`OFDMerger`（ofdrw-tool），按页范围选择。
- **拆分**：基于 `OFDMerger` 的页选择能力逐区间导出（M3 验证后定稿）。

---

## 6. 桌面端设计（Electron）

### 6.1 进程职责

- **Main**：窗口生命周期、原生对话框、引擎进程管理、日志、单实例锁、文件关联启动参数。
- **Preload**：仅暴露白名单 API（`pickDocument`、`getBackendInfo`、`onBackendStatus`、`revealPath`、`getPathForFile`、应用版本）。
- **Renderer**：纯 UI，无 Node 权限，不直接读文件系统。

### 6.2 安全基线

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 禁止 `window.open`、外部导航、`webview`；外链交给系统浏览器。
- CSP：`default-src 'self'`；`img-src`/`connect-src` 仅允许自身与 `http://127.0.0.1:*`；开发期额外放行 Vite HMR。
- 已实测：渲染进程 `require` / `process` 均不可见，`window.open` 被拦截，CSP 生效。
- 原生对话框选择文件；渲染进程不能拼任意路径去写文件（写操作仅在 M2 后通过“保存对话框”授权路径）。
- 发布前检查：依赖审计、ASAR 完整性、安装包签名。

### 6.3 视觉方向

- 关键词：**温润、可靠、国风但现代**；避免“后台管理系统”观感。
- 色板：
  - 背景米白 `#F6F4EC`，卡片 `#FFFFFF`，正文墨绿黑 `#17251C`；
  - 品牌豆绿 `#2F7A4F`，浅豆绿 `#E4F0E7`，点缀麦黄 `#E4B54B`；
  - 分割线 `#E4E0D5`。
- 标识：豆荚造型 + “阿豆OFD”字标；已输出多尺寸 ICO（`desktop/build/icon.ico`）。
- 字体：系统字体栈（Windows 优先“微软雅黑 UI”/“Segoe UI”）。
- 布局：左侧 236px 应用导航（可折叠为 72px 图标栏）；阅读区左侧“缩略图 / 目录”导航面板、中间连续页面画布；底部悬浮缩放/页码工具条；空状态与加载态均有明确反馈。
- 精简：侧栏只保留“文档查看 / 关于”，引擎详细信息移入“关于”弹层；空状态移除功能卡；顶部仅在引擎异常/启动中显示状态。
- “关于”：展示版本、MIT 许可、Java/ofdrw/Spring Boot/Electron 版本、本地运行状态与开源仓库入口。
- 文档栏显示 OFD/PDF 格式徽标；空状态提供“打开文档 / OFD 示例 / PDF 示例”三个入口。
- 目录条目按层级缩进、显示目标页码；当前章节高亮，点击跳页。

### 6.4 当前交互（M1.1）

1. 启动：品牌区 + 引擎状态芯片（启动中/已就绪/失败可重试）；应用导航可折叠。
2. 打开文档：支持 `.ofd` / `.pdf`，拖拽或原生对话框；默认连续多页视图 + 适合宽度。
3. 示例：OFD 示例 4 页、PDF 示例 3 页（带 6 项目录），均无需外部文件即可体验。
4. 导航面板：缩略图 / 目录双页签；缩略图点击跳页，目录点击跳页并高亮当前章节。
5. 页码：顶部输入框可直接跳页，或使用上下页按钮、←/→ 快捷键。
6. 缩放：底部工具条提供缩小/放大、比例菜单、适合宽度、适合页面；支持 Ctrl+滚轮。
7. 页面按需渲染：只加载视口附近的页面；缩放时按当前比例请求合适 DPI。
8. 文字：页面文字可直接框选、复制；跨行复制保留换行；右键弹出“复制选中文字”；拖出页面/文字范围时选区被钳制，不会整页选中。扫描件无文字层。
9. 失败：单页错误提示与重试，不阻塞其他页面；加密 PDF、损坏文件给出中文提示。

---

## 7. 打包与分发

### 7.1 组成

```
阿豆OFD/
├─ 阿豆OFD.exe                 Electron 主程序
├─ resources/
│  ├─ app.asar                 渲染进程与主进程代码
│  ├─ backend/adou-ofd-backend.jar
│  └─ jre/                     Java 25 运行时（原型为完整 JDK，M4 用 jlink 裁剪）
└─ ...
```

### 7.2 构建流程

1. `mvn -DskipTests package` 产出可执行 fat jar。
2. `jlink --add-modules ...` 生成最小 JRE（需包含 `java.desktop`、`java.net.http`、`jdk.crypto.ec` 等；M0 原型直接内置完整 JDK，M4 启用裁剪）。
3. `electron-builder --win nsis` 打包，`extraResources` 注入 jar 与 jre。
4. 安装包默认按用户安装（无需管理员），支持自定义目录。

### 7.3 实测与待办

- 已实测（2026-10-30）：免安装目录约 712MB，NSIS 安装包约 272MB；0.5.2 打包产物使用内置 JRE 25.0.5 成功启动，并完成 OFD/PDF/目录/折叠/逐字选择/越界钳制冒烟。
- 代码签名证书（当前无，SmartScreen 会提示“未知发布者”）。
- 安装包体积优化（jlink 裁剪，目标 <150MB）。
- 自动更新源与回滚策略（M4 评估）。

---

## 8. 性能与质量目标

| 指标 | 目标（M1） |
| --- | --- |
| 冷启动到可交互 | ≤ 5s（SSD，含 Java 引擎） |
| 50 页 OFD 首页渲染 | ≤ 1.5s（144 DPI） |
| 翻页（已缓存） | ≤ 100ms |
| 100 页 OFD 内存占用 | ≤ 600MB |
| 崩溃率 | 会话级隔离，单文档解析失败不影响应用 |
| 日志 | 引擎日志落盘，单文件 5MB 轮转，保留 3 份 |

M0 实测：Java 引擎启动约 1.2–1.4s；真实发票 1 页在 144 DPI 下渲染为 1192×794 PNG。  
压力测试（详见 `docs/STRESS-TEST.md`）：800 页 PDF 引擎打开 70–411ms、末页约 0.2s、文字层 79–199ms/页；UI 首屏 1.2–2.2s（冷启动波动）、中/末页约 0.3–1.6s；页面/缩略图 800 节点无崩溃。

---

## 9. 测试策略

- **单元/集成测试（Java）**：
  - 生成示例 OFD → 打开 → 页数/尺寸断言；
  - 页面渲染 PNG 校验（非空、尺寸符合 DPI、像素非全白）；
  - OFD→PDF→OFD 往返冒烟；
  - 生成示例 PDF → 打开 → 3 页/A4/渲染/缩略图；
  - 真实 PDF 打开与渲染；
  - 加密 PDF 返回 `PDF_ENCRYPTED`；
  - Token 鉴权、越界页码、损坏文件错误码。
- **端到端（Electron）**：
  - 启动即健康检查成功；
  - 打开 OFD 多页示例，连续滚动/翻页/缩略图跳页；
  - 缩放按钮、适合宽度、适合页面、Ctrl+滚轮；
  - 页码输入与当前页同步；
  - 打开 PDF 示例，验证 PDF 渲染、缩略图、翻页与格式徽标；
  - 目录页签加载与跳页（PDF 大纲 / OFD 空目录提示）；
  - 应用导航折叠与恢复（72px / 236px）；
  - 压力测试：800 页 PDF、100 页 20MB 图片 PDF、91 页 OFD；
  - 关闭文档、退出后无残留 java 进程；
  - 安全基线：无 Node 暴露、弹窗拦截、CSP 生效。
- **兼容性样例**：电子发票、公文、带签章 OFD、扫描件 OFD、加密/异常 OFD（预期给出友好错误）。
- **回归基线**：每次升级 ofdrw/JDK/Electron 必跑上述用例，结果记入 §13。

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| ofdrw 在 JDK 25 上的 AWT/字体兼容问题 | 页面空白、乱码 | 已验证通过（真实发票 + 多页示例）；后续升级仍跑回归 |
| 个别 OFD 的 DrawParam 循环引用触发 ofdrw `StackOverflowError` | 单页无法渲染、日志膨胀 | 引擎捕获单页 `StackOverflowError` 返回 `RENDER_OVERFLOW`；JVM `-Xss2m`；向 ofdrw 上游反馈，M1.2 增加预检/降级 |
| PDF 大页面/复杂文档内存占用 | 渲染慢或 OOM | PDFBox 混合内存 128MB；页面最长边 12000px 上限；会话 LRU 与单页异常隔离 |
| PDF 字体/图像/旋转兼容性 | 页面空白或方向错误 | PDFBox 2.0.27；CropBox/旋转参与尺寸计算；真实 PDF 已回归 |
| iText 7（AGPL）随 ofdrw-converter 传递依赖 | 分发许可风险 | 只使用 PDFBox 导出路径；评估 Maven 排除 iText；公开分发前完成许可审查，必要时开源或取得授权 |
| PDF→OFD 字体/排版保真度 | 转换效果不达预期 | 明确“保版面、可阅读”目标；扫描件按图嵌入；输出质量报告 |
| 大文件/恶意 OFD 导致内存或路径穿越 | 稳定性/安全 | 限制解压大小（ofdrw `setZipFileMaxSize`）、会话隔离、临时目录白名单、超时 |
| Electron + 本地 HTTP 被本机其他程序调用 | 数据泄露/滥用 | 随机端口 + 每次启动 Token + 仅回环；后续改 IPC/自定义协议 |
| 安装包体积与启动速度 | 体验 | jlink 裁剪、ASAR、按需加载页面、启动并行化 |
| 无代码签名 | 信任与安装成功率 | M4 前采购签名证书；提供 SHA256 校验与官网下载 |

---

## 11. 许可与合规（重要）

- 应用自身代码以 **MIT License** 发布（`LICENSE`）。
- ofdrw：Apache-2.0。
- PDFBox / FontBox / Batik：Apache-2.0。
- **iText 7（ofdrw-converter 依赖）：AGPL-3.0**。若分发包含 iText 代码，需满足 AGPL 或取得商业授权。
  - 行动项：M1 验证仅依赖 `PDFExporterPDFBox` 时能否排除 iText；若可行，从依赖树移除并在 CI 加校验。
- BouncyCastle：MIT 风格许可；ujmp 等传递依赖需在发布前生成完整 SBOM（CycloneDX）。

---

## 12. 验收标准（M0）

- [x] 按 README 准备项目内 JDK 与依赖后，可启动开发环境（`npm run dev` / `npm run dev:all`）。
- [x] 启动后 5s 内显示“引擎已就绪”，版本信息与锁定版本一致（实测引擎 1.2–1.4s）。
- [x] 可打开真实 OFD 发票并显示页数与页面图像。
- [x] 可打开内置示例，无外部文件也能完成体验。
- [x] 翻页正常（示例 1/2 → 2/2），页码边界有明确提示。
- [x] 关闭窗口后 Java 进程退出（退出码 0，任务管理器无残留）。
- [x] Java 集成测试全绿，含 ofdrw 在 JDK 25 上的渲染/转换冒烟。
- [x] 渲染进程无 Node 权限，CSP 生效，外部导航/弹窗被拦截。
- [x] Windows NSIS 安装包可生成，打包产物使用内置 JRE 正常启动。

### 12.1 M1.1 预览增强验收

- [x] 多页连续滚动，页面按需加载，视口外页面延迟渲染。
- [x] 缩略图数量与页数一致，当前页高亮，点击可跳页。
- [x] 缩放按钮、比例菜单、适合宽度、适合页面、Ctrl+滚轮均生效。
- [x] 页码输入、上下页按钮、←/→ 快捷翻页与当前页同步。
- [x] 缩放后命中缓存的图片仍能清除加载遮罩（`img.complete` 兜底）。
- [x] 单页渲染异常被隔离，不阻塞其他页面与应用主流程。
- [x] 文档导航面板支持缩略图 / 目录双页签，目录点击跳页并高亮。
- [x] PDF 目录解析与展示（示例 6 项、压测 96 项）；OFD 目录无数据时显示空状态。
- [x] 应用左侧导航可折叠为 72px 图标栏并恢复。
- [x] 大文件压力测试通过（800 页 / 20MB / 91 页 OFD），无崩溃与运行时错误。
- [x] 页面文字逐字框选复制：OFD/PDF 选区文本正确、跨行复制保留换行，字形/字号/旋转版面下高亮对齐。
- [x] 右键原生复制菜单；拖出文字/页面后选区钳制（实测正常拖选 19 字、越界仅 44 字，不再整页选中）。
- [ ] 全文搜索、页面旋转、最近文件/文件关联（M1.2）。

### 12.2 PDF 预览验收

- [x] 原生对话框与拖拽均支持 .pdf；空状态提供 PDF 示例。
- [x] 正确读取 PDF 页数、页面尺寸与旋转（含横向页面）。
- [x] PDF 页面按 DPI 渲染 PNG，缩略图、连续滚动、缩放、翻页、页码跳转全部可用。
- [x] 加密 PDF 返回友好提示，不影响其他文档打开。
- [x] 真实 PDF 文件打开与渲染验证通过。
- [x] UI 冒烟覆盖 PDF 示例：3 页、3 个缩略图、翻页到第 2 页。
- [ ] PDF 文本选择/搜索、PDF 注解显示（M1.2）。

---

## 13. 验证记录

| 日期 | 项目 | 环境 | 结果 | 证据/备注 |
| --- | --- | --- | --- | --- |
| 2026-10-30 | 示例生成、分页、渲染 | JDK 25.0.5 / Windows 11 | ✅ | 示例自动生成 4 页 A4；96 DPI 图像 >700px 且含可见墨迹 |
| 2026-10-30 | OFD→PDF（PDFBox） | JDK 25.0.5 | ✅ | 集成测试通过，输出 PDF 非空 |
| 2026-10-30 | PDF→OFD | JDK 25.0.5 | ✅ | 往返后页数与源文档一致 |
| 2026-10-30 | 真实发票打开/渲染 | JDK 25.0.5 | ✅ | 1 页，210.3×140.1 mm；144 DPI 输出 1192×794 PNG |
| 2026-10-30 | JDK 兼容性对照 | JDK 21.0.10 vs 25.0.5 | ✅ | 同一发票 PNG SHA256 均为 `89a73459…`，字节一致；页面色块为源文档特性，非 JDK 兼容问题 |
| 2026-10-30 | Electron 握手与 UI | Electron 45.1.0 | ✅ | 生产 / Vite 开发 / 打包三种形态均就绪；无渲染进程运行时错误 |
| 2026-10-30 | 多页渲染全扫描 | JDK 25.0.5 | ✅ | 4 页 × 24/144/180/216/300 DPI 全部渲染成功 |
| 2026-10-30 | PDF 示例打开/渲染 | JDK 25.0.5 | ✅ | 3 页 A4；96 DPI 渲染 >700px；24 DPI 缩略图正常 |
| 2026-10-30 | 真实 PDF 打开/渲染 | JDK 25.0.5 | ✅ | 297×210mm 横向页面；96 DPI 输出 1122×793 PNG |
| 2026-10-30 | 加密 PDF | JDK 25.0.5 | ✅ | 返回 `PDF_ENCRYPTED`，未创建残留会话 |
| 2026-10-30 | UI PDF 预览 | Electron 45.1.0 | ✅ | PDF 徽标、3 页/3 缩略图、翻页到第 2 页、无运行时错误 |
| 2026-10-30 | 文档目录 | Electron 45.1.0 | ✅ | PDF 示例 6 项目录（含二级）、目录跳页到第 3 页；OFD 无目录空状态 |
| 2026-10-30 | 应用导航折叠 | Electron 45.1.0 | ✅ | 236px ↔ 72px，阅读区自适应，状态持久化 |
| 2026-10-30 | 压力测试（引擎） | JDK 25.0.5 | ✅ | 800 页 PDF 打开 70–411ms、末页 42–203ms、逐字文字层 79–199ms；100 页/20MB PDF 末页 565ms；91 页 OFD 末页 230ms；RSS ≤476MB |
| 2026-10-30 | 压力测试（UI） | Electron 45.1.0 | ✅ | 800 页面节点 + 800 缩略图节点；首屏 1.2–2.2s、中/末页 0.3–1.6s；逐字文字层后 JS 堆约 61MB；无错误 |
| 2026-10-30 | 文字选择/复制 | Electron 45.1.0 | ✅ | 逐字文字层；OFD/PDF 选区文本正确、行结构保留；字形与字号高亮对齐；右键复制菜单；越界选区钳制 |
| 2026-10-30 | 旋转 PDF 文字层 | JDK 25.0.5 | ✅ | 90° 页面宽高交换；文字框转为竖长条，按显示坐标归一化 |
| 2026-10-30 | 连续滚动与页码 | Electron 45.1.0 | ✅ | 1/4 → 2/4，平滑滚动期间页码不回跳 |
| 2026-10-30 | 缩略图与跳页 | Electron 45.1.0 | ✅ | 4 个缩略图；点击第 3 页，页码与高亮同步 |
| 2026-10-30 | 缩放 | Electron 45.1.0 | ✅ | 按钮 93%→116%；适合页面 93%→42%；Ctrl+滚轮 93%→102% |
| 2026-10-30 | 缓存图片加载状态 | Electron 45.1.0 | ✅ | 缩放命中缓存时通过 `img.complete` 兜底，加载遮罩正常清除 |
| 2026-10-30 | 渲染异常隔离 | JDK 25.0.5 | ⚠️ | 已捕获单页 `StackOverflowError` 并返回 `RENDER_OVERFLOW`；暂无稳定复现样例，待上游修复/回归 |
| 2026-10-30 | UI 安全基线 | Electron 45.1.0 | ✅ | `require`/`process` 不可见；`window.open` 被拦截；CSP 生效 |
| 2026-10-30 | 进程清理 | 打包应用 | ✅ | 关闭窗口后 Java 引擎退出码 0，无残留进程 |
| 2026-10-30 | NSIS 打包 | electron-builder 26.18.0 | ✅ | 0.5.2 安装包约 272MB（SHA256 `65c740cc…`），未签名；内置 JRE 25.0.5 可启动，打包版 OFD/PDF/目录/折叠/逐字选择/越界钳制冒烟通过 |
| 2026-10-30 | 界面精简与关于 | Electron 45.1.0 | ✅ | 侧栏仅保留文档查看/关于；引擎详情移入关于弹层；空状态精简；关于弹层展示版本与许可 |

## 14. 决策记录（ADR 摘要）

1. **ADR-001 采用 Java sidecar 而非 JNI**：调试成本低、可独立测试、崩溃隔离；代价是多一个进程与本地 HTTP 攻击面，用回环 + Token 收敛。
2. **ADR-002 锁定 ofdrw-full 2.3.7**：最新稳定、模块完整；升级必须跑 §9 回归。
3. **ADR-003 使用 JDK 25 LTS + Spring Boot 4**：满足“最新稳定优先”；项目内自带 JDK，发布用 jlink，不依赖用户环境。
4. **ADR-004 React + TypeScript + electron-vite**：UI 复杂度会随阅读器/任务队列增长，需要组件化与类型约束；不引入 UI 框架，控制体积。
5. **ADR-005 转换默认新文件输出**：绝不原地修改用户文档，降低数据损失风险。
6. **ADR-006 连续滚动 + 缩略图 + 按缩放选择渲染 DPI**：页面按需加载，缩略图固定 24 DPI，主页面 96–300 DPI；兼顾清晰度、内存与首次渲染速度；代价是缩放时部分页面会重新请求。
7. **ADR-007 PDF 使用 PDFBox 2.0.27 并保持会话级 PDDocument**：与 ofdrw-converter 依赖版本严格对齐，避免 PDFBox 3.x API 不兼容；会话持有 PDDocument 以提升多页/缩放性能，渲染串行化保证线程安全。
8. **ADR-008 统一 DocumentHandle 与文档目录**：OFD/PDF 共用会话句柄接口，各自持有解析器；OFD 复用 OFDReader/ImageMaker，PDF 复用 PDDocument；目录统一为 `{title,page,level}`，UI 双页签展示。压测证明大文件渲染与目录解析可用。
9. **ADR-009 文字层叠加而非更换预览库**：保留现有 PNG 预览，后端按页输出归一化文本行，前端叠加透明文字层；OFD/PDF 均可框选复制，避免引入 PDF.js 与 OFD 转 PDF 的兼容/性能成本。扫描件无文本层为已知限制。

---

## 15. M0 + M1.1 + PDF + 目录/折叠 + 文字选择 + 压测交付物

### 15.1 交付物

- 设计：[docs/PRD.md](PRD.md)。
- 压测：[docs/STRESS-TEST.md](STRESS-TEST.md)。
- 引擎：`backend/`（Spring Boot 4.0.9 + ofdrw 2.3.7 + PDFBox 2.0.27，9 个测试全绿；OFD/PDF 统一句柄、目录与文字层提取）。
- 桌面端：`desktop/`（Electron 45.1.0 + React 19 + TS 7；连续滚动、缩略图、目录、缩放、页码、应用导航折叠）。
- 工具链：`scripts/setup-jdk.mjs`、`scripts/build-backend.mjs`、`scripts/install-electron.mjs`、`scripts/electron-vite.mjs`、`scripts/smoke-ui.mjs`、`scripts/stress-fixtures.mjs`、`scripts/stress-backend.mjs`、`scripts/stress-ui.mjs`。
- 界面截图：`docs/screenshots/`（空状态、关于、OFD/PDF 阅读器、目录、折叠、文字选择、800 页压测）。
- 许可：[LICENSE](../LICENSE)、[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)。
- 压力夹具：`backend/src/test/java/com/adou/ofd/StressFixtureGenerator.java`（生成到 `.tools/stress`，不纳入版本库）。
- 安装包：本机已验证 NSIS 生成与运行（未签名，约 272MB；不纳入版本库）。

### 15.2 本轮完成

- 应用左侧导航折叠（236px ↔ 72px，状态持久化）。
- 阅读器导航面板“缩略图 / 目录”双页签；PDF Outline / OFD Outlines+Bookmarks 解析、跳页、高亮。
- OFD 改为会话级 Reader + ImageMaker，多页渲染性能显著提升。
- 大文件压力测试与报告：800 页 PDF、100 页/20MB 图片 PDF、91 页 OFD。
- 页面文字层：PDF/OFD 框选复制，保留换行。

### 15.3 待用户确认

1. **下一阶段优先级**：先补 M1.2 阅读能力（文本复制、搜索、旋转、PDF 注解/签章面板），还是先做 M2 PDF↔OFD 转换？
2. **iText 许可路线**：仅保留 PDFBox 导出并尝试排除 iText，或以 AGPL 方式开源，或采购商业授权。
3. **包体积**：M4 前是否投入 jlink 裁剪（目标安装包 <150MB）。
4. **视觉与图标**：当前豆绿/米白风格、缩略图 + 目录 + 悬浮缩放条布局是否保留。

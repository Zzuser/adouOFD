# 阿豆OFD — 产品与技术设计 PRD

| 项目 | 内容 |
| --- | --- |
| 产品名称 | 阿豆OFD（ADou OFD） |
| 文档版本 | v0.8.0（M0 + M1.1 + PDF + 目录/折叠 + 逐字选择 + 转换 + 合并 + 全文搜索 + 打印 + Windows 集成） |
| 日期 | 2026-11-02 |
| 阶段 | 0.8.0：预览、搜索、打印、转换、合并、多标签、Windows 文件关联、Inno 安装包、统一页头与功能化文案 |
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
- **多标签查看**：同时打开最多 8 个文档，标签切换保留阅读位置/缩放/导航状态；批量转换与合并列表提供“查看”入口，直接跳转到对应标签。
- **Windows 文件关联与单实例**：安装版启动时在 HKCU 注册两个独立 ProgID（`AdouOFD.OFD` / `AdouOFD.PDF`）、`.ofd` / `.pdf` 的 OpenWithProgids，以及 RegisteredApplications/Capabilities；`DefaultIcon` 分别指向随包携带的 `ofd-file.ico` / `pdf-file.ico`（奶油纸 + 金色折角，豆绿/印章红标签，16–256px 多尺寸）。不写 HKLM、不抢已存在的 UserChoice 默认应用。双击文件时通过命令行参数并入当前窗口（第二实例会唤醒并聚焦已有窗口）；“关于”中可注册/修复、调用 Windows“打开方式”选择默认、打开系统默认应用设置或移除注册。安装包卸载脚本会清理这些每用户注册项，并恢复注册前的 `.ofd` 扩展默认值。
- **全文搜索**：阅读器“查找”或 `Ctrl+F` 打开搜索条；后台逐页扫描 OFD / PDF 文字层并增量返回命中，不阻塞渲染；结果列表显示页码与上下文片段，点击/上下键逐条定位，命中文字在页面内高亮，当前项用印章红强调；支持区分大小写、跨换行短语匹配；长文档显示扫描进度，切换关键词自动取消旧任务；最多保留 300 条命中（仍统计总数），单页文本提取失败不影响其他页面。
- **文字选择/复制**：逐字文字层，支持框选、跨行复制并保留换行；右键选区弹出原生复制菜单；拖出文字/页面时钳制到最后一个有效字形，避免整页误选。
- **打印**：阅读器“打印”或 `Ctrl+P` 打开应用内打印面板，左侧设置、右侧实时预览与分张导航；支持打印机（含系统默认）、份数、灰度、全部/当前页/自定义范围、奇偶页、逆序、纸张大小/方向/页边距（默认/无边距/自定义）、每张多页（2/4/6/8/9 页，按行/按列、打印边框）与双面打印。主进程按设置生成打印页并由隐藏窗口直接发送到所选打印机，OFD / PDF 共用同一渲染路径；页面按 300 / 200 / 150 DPI 随页数自适应渲染，失败时在面板内提示。单文件转换结果、批量转换结果行与合并结果均提供“打印”入口，直接打开打印面板；若结果已在标签中则复用会话，否则临时打开并在关闭面板后释放，不新增标签。
- **压力测试**：800 页矢量 PDF、100 页/20MB 图片 PDF、91 页 OFD；引擎与 UI 打开/跳页/缩略图/目录压测通过，详见 `docs/STRESS-TEST.md`。

**M1.2 待办：完整阅读器**

- 页面旋转、文档属性与签章面板。
- 最近打开、拖拽打开全屏。
- 大文档内存上限与页面卸载策略。

### 2.3 M2：格式转换

**已实现（单文件转换）**

- OFD → PDF：`PdfboxMaker` 逐页矢量导出，保留可复制文字与页面尺寸；导出后做中文保真检查，字体无法嵌入时自动改为本机渲染图像导出（150 DPI）并在报告中提示。
- PDF → OFD：`PDFConverter` 分批转换，页数、页面尺寸保留；输出为矢量图形，文字不可选中（ofdrw 转换特性，报告中提示）。
- 转换任务：单工作线程 + 有界队列（8）、进度、取消、临时文件 + 原子落盘、页数与体积校验、字体/文字质量提示。
- 桌面端：阅读器“转换”入口（单文件）、保存对话框、进度条、取消、结果报告、打开结果/定位文件。
- **批量转换标签页**：左侧独立导航；添加/拖入多个文件（轻量探测页数与格式，不建立阅读会话）、选择输出目录（记忆）、逐个转换与进度、停止、失败项重试、同名自动加序号、完成后可打开结果。

**待办**

- 转换历史与命名模板；批量并发上限可配置（当前为 1，与单工作线程一致）。

### 2.4 M3：合并、拆分与插页

**合并已实现**

- 独立“合并文档”标签页：拖入多个 OFD / PDF，列表顺序即最终页序；支持拖动或上下按钮调整顺序、删除、清空。
- 用户选择输出格式（OFD / PDF）；混合输入会先归一化到目标格式再合并，PDF→OFD / OFD→PDF 复用现有转换引擎。
- 任务能力：与转换共用单工作线程 + 有界队列、进度、取消、临时文件 + 原子落盘、页数校验、质量告警、OOM 可读提示；单次最多 100 个文件。
- **资源修复**：部分真实发票 OFD 在 Res 中声明了图片/字体，但包内缺失（如水印 `redInvoiceWatermark.png`）；`OFDMerger` 会因此直接失败。合并前扫描资源引用，为缺失资源补充透明/空占位文件后继续合并，并在报告中提示。
- **样式修复**：`OFDMerger` 保留 DrawParam 的 `Relative` 继承但不重映射被引用 ID，合并后可能继承到其他文档的白色描边，表现为发票表格框线消失。合并前把 DrawParam 继承链展开为自包含样式，并移除指向不存在 ColorSpace 的引用；报告中提示“已展开样式继承”。
- 合并结果不保证保留各文件的目录/书签；混合转换的文字可选中性沿用转换能力边界。

**拆分与插页已实现**

- 独立“拆分与插页”标签页；拆分支持每页一份、每 N 页一份、按自定义页码区间（逗号分隔，每段一个文件）；可设置文件名前缀、输出目录，同名结果自动加序号，不覆盖已有文件。
- 插页支持把另一个 OFD / PDF 的指定页插入主文档开头、指定页前或末尾；插入文档与主文档格式不同时，先转换插入页再按主文档格式输出。
- 页面预览：拆分显示页面缩略图、分组颜色和区间未选页淡化；插页显示主文档插入位置虚线与插入文档选中页高亮。
- 任务能力：与转换/合并共享单工作线程、进度、取消、临时文件 + 原子落盘、页数校验；拆分一次最多生成 300 个文件。
- 页面预览使用独立文档会话（最多 6 个），不占用阅读器 8 个标签会话。

**待办**

- 合并/拆分后完整性校验扩展（页面尺寸汇总、书签策略）。

### 2.5 M4：安装与发布

- Windows Inno Setup 安装包（含文件关联安装任务）、NSIS 备用构建。
- 应用图标、文件关联、开始菜单、卸载清理。
- 自动更新（可选，默认关闭）、崩溃日志与一键导出诊断信息。

### 2.6 非目标（当前不做）

- 在线协作、云存储、账号体系。
- OFD 编辑（改文字、改版面）与签章制作。
- 移动端。
- 打印驱动/虚拟打印机（打印直接使用 Windows 已安装的打印机驱动，不内置虚拟打印机）。
- 打印机驱动属性面板（纸盒、打印质量等使用驱动默认值，暂不提供驱动属性对话框）。

---

## 3. 技术栈与版本锁定

> 原则：**最新稳定版优先，兼容性以冒烟测试为准**。所有运行时依赖由项目自带，不依赖用户环境。

| 层 | 选型 | 版本 | 说明 |
| --- | --- | --- | --- |
| 桌面壳 | Electron | 45.1.0 | 当前稳定版，内置 Chromium/Node |
| 构建 | electron-vite | 6.0.0 | 主进程/预加载/渲染进程统一构建 |
| 前端 | React + TypeScript | 19.3.1 / 7.0.2 | 函数组件 + 严格类型 |
| 构建 | Vite | 8.3.5 | 渲染进程开发服务器与产物构建 |
| 打包 | Inno Setup 6 + electron-builder | 6.x / 26.18.0 | Inno Setup 安装包 / NSIS 备用 |
| 运行时 | Eclipse Temurin JDK | **25.0.5+8 LTS** | 项目内 `.tools/jdk-25`，发布时 jlink 裁剪 |
| 框架 | Spring Boot | 4.0.9 | 仅作为本地 HTTP 引擎，绑定 127.0.0.1 |
| OFD 核心 | ofdrw-full | **2.5.1** | 2026-11-01 发布，移除 iText、协议改 MIT、PDF→OFD 新增文字对象化 |
| PDF 渲染 | Apache PDFBox | **2.0.27** | 与 ofdrw-converter 内置版本对齐；Apache-2.0 |
| 构建 | Maven | 3.9.16 | 最新稳定 3.9 线；Maven 4 仍为 RC |
| 开发 Node | Node.js | 24.13.0 LTS | 仅构建期使用，不随应用分发 |

### 3.1 版本选择依据

- **ofdrw 2.5.1**：`ofdrw-full` 聚合 reader / converter / layout / tool 等模块，覆盖查看、转 PDF、PDF 转 OFD、合并；2.5.1 起彻底移除 iText（无 AGPL 依赖），协议为 MIT。
- **PDFBox 3.0.8**：与 ofdrw-converter 2.5.1 对齐；加载入口为 `Loader.loadPDF`，颜色 API 使用 0–1 浮点，流缓存通过 `MemoryUsageSetting.streamCache` 传入。
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
│  · 文档导航 / 预览 / 工具栏   │   │ Spring Boot 4 + ofdrw 2.5.1│
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
| `merge` (M3) | 合并任务 |
| `pages` (M3) | 拆分、插页任务与页面预览会话 |
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

- 会话 LRU 上限 **8**；前端标签上限同为 8。关闭标签会调用 `DELETE /api/documents/{id}`，避免后端静默淘汰导致标签失效。
- 每个标签对应一个独立 Viewer（隐藏但保持挂载），切换标签不重建页面，保留滚动位置、缩放与已渲染页面。

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
| POST | `/api/documents/{id}/searches` | `{ "query": "...", "caseSensitive": false }` 创建后台全文搜索（202） |
| GET | `/api/documents/{id}/searches/{searchId}` | 搜索任务快照；扫描中 `hits` 增量增长，含进度、总数、截断与失败页数 |
| POST | `/api/documents/{id}/searches/{searchId}/cancel` | 取消搜索任务 |
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

### 5.5 转换与合并 API（M2 / M3 合并已实现）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/conversions` | `{ documentId?, sourcePath?, target: "PDF"/"OFD", outputPath, overwrite? }`，202 返回任务 |
| POST | `/api/conversions/probe` | `{ paths: [] }` → `[{ path, name, size, kind, pages, error }]`，批量加文件用，不建立会话 |
| GET | `/api/conversions/{id}` | `{ status, progress, phase, report, errorCode, ... }` |
| GET | `/api/conversions?limit=20` | 最近任务列表（最多保留 20 条） |
| POST | `/api/conversions/{id}/cancel` | 取消排队/执行中的任务 |
| POST | `/api/merges` | `{ files: [path...], target: "PDF"/"OFD", outputPath, overwrite? }`，202 返回任务；files 顺序即页序 |
| GET | `/api/merges/{id}` | `{ status, progress, phase, target, report, errorCode, ... }` |
| GET | `/api/merges?limit=20` | 最近合并任务列表 |
| POST | `/api/merges/{id}/cancel` | 取消排队/执行中的合并任务 |
| POST | `/api/split` | `{ documentId, ranges: [{from,to}], outputDir, namePattern }`（M3 待办） |

转换与合并统一进入**单工作线程 + 有界队列（8）**：两类任务都吃 CPU/内存，串行执行避免同时跑两份大文档；进度按页/文件上报，队列满时分别返回 `CONVERSION_QUEUE_FULL` / `MERGE_QUEUE_FULL`。

错误码补充：`SOURCE_REQUIRED`、`INVALID_TARGET`、`SAME_FORMAT`、`OUTPUT_REQUIRED`、`OUTPUT_EXISTS`（409）、`SOURCE_IS_OUTPUT`、`INVALID_OUTPUT_PATH`、`JOB_NOT_FOUND`、`CONVERSION_QUEUE_FULL`（429）、`FILES_REQUIRED`、`NEED_TWO_FILES`、`TOO_MANY_FILES`、`UNSUPPORTED_FORMAT`、`MERGE_QUEUE_FULL`（429）。

### 5.6 关键实现选型

- **OFD 读取**：`OFDReader` → `getNumberOfPages()` / `getPageSize(int)` / `hasSignature()`。
- **OFD 页面渲染**：`ImageExporter`（ofdrw-converter），PNG。
- **PDF 读取/渲染**：PDFBox 3.0.8 `Loader.loadPDF` + `PDFRenderer`；CropBox/MediaBox 与页面旋转参与尺寸计算；签名通过 `getSignatureDictionaries()` 检测。
- **PDF 安全**：加密 PDF 捕获 `InvalidPasswordException` 返回 `PDF_ENCRYPTED`；渲染最长边 12000px 上限。
- **逐字文字层**：PDF 使用每个 `TextPosition` 的字形框；OFD 使用 `TextObject` 边界、`TextCode` 的 X/Y 与 `DeltaX` 推进逐字位置；按基线变化插入换行。坐标/字号归一化后前端逐字叠加，选区随字形与字号对齐，并处理 PDF 页面旋转。扫描件无文本层。
- **目录提取**：
  - PDF：`PDDocumentOutline` 递归遍历，`PDOutlineItem.findDestinationPage()` 解析页码，层级扁平化为 level。
  - OFD：`Document.getOutlines()` 递归（Actions → Goto → Dest → PageID 映射页码）；无 Outlines 时回退 `getBookmarks()`。
  - 目录条目上限 5000，深度上限 20，损坏目录不影响页面预览。
- **OFD→PDF**：`PdfboxMaker`（Apache PDFBox 3.0.8）逐页导出，不采用 iText 实现。
  - **字体别名**：ofdrw 在 TTC 字体集合中只按 PS 名（如 `MicrosoftYaHei`）查找，OFD 里的中文族名（微软雅黑/宋体）会查不到字形并静默退回 Helvetica，导致中文整段丢失。转换前把系统字体族名（含 `Locale.CHINA`/`ENGLISH` 本地化名）映射到 PS 名，可显著提升中文保真。
  - **保真兜底**：矢量导出后抽样比较源 OFD 与输出 PDF 的中文字符数，若输出不足源文档 1/3，判定字体失败，删除结果并改用本机 `ImageMaker` 150 DPI 渲染后写入 PDF，报告提示“文字不可选中”。
- **PDF→OFD**：按 PDF 内嵌字体能力自动选择转换器。
  - **文字模式**（`PDFConverter`）：ofdrw 2.5.1 起逐页生成 OFD `TextObject` 并内嵌字体，输出文字可选中/可检索。前提是 PDF 内嵌字体程序完整（含 `cmap`）；`setSubsetFont(true)` 用于控制体积。
  - **图形模式**（`PDFGraphicsConverter`）：整页按矢量图形输出，速度快、版面一致，但文字不可选中。
  - 判定逻辑（`canPreservePdfText`）：遍历页面字体资源，任一字体未内嵌、非 TrueType（无 FontFile2）或字体程序缺 `cmap` 即判为不可保留文字。
  - 实测：子集字体 PDF（PDFBox 生成示例、真实 404 页手册）文字模式会逐字体回退，20 页耗时 23.8 秒；图形模式仅 2.9 秒且输出完全相同。字体完整嵌入的 PDF 走文字模式，1 页 OFD 体积由 5.1MB（整字体嵌入）降至可接受范围（开启子集化）。
- **输出安全**：先写同目录临时文件（`.名字.adou-tmp-xxxxxxxx.ext`），校验通过后原子替换目标；失败/取消删除临时文件，源文件只读。
- **内存与失败处理**：PDF→OFD 由 ofdrw 在内存中构建整份 OFD，因此按页数与堆大小自动选择单次或分片。
  - **实测（2GB 堆，27MB 手册及其子集）**：

    | 页数 | 单次转换 | 分片（2 线程） |
    | --- | --- | --- |
    | 60 | 9.0s / 977MB | — |
    | 120 | 17.9s / 1579MB | — |
    | 200 | 27.2s / 1883MB | 31.5s / 1033MB |
    | 300 | 35.9s / 1988MB | 43.8s / 1181MB |
    | 404 | 51.6s / 2022MB | 57.5s / 1520MB |

  - 单次转换峰值约 12MB/页，超过堆 75% 后 GC 抖动明显；合并耗时约 75ms/页，与分片数量几乎无关。
  - **虚拟线程无收益**：CPU 密集的矢量转换在相同并发度下 43.0s vs 平台线程 43.8s，只提高并发度并抬高内存，故未采用。
  - 策略：`shouldShard = 页数 × 12MB > 堆 × 75%`；`shardPages = clamp(ceil(页数/10), 20, min(60, 堆×45%/线程数/12))`；`workers = clamp(堆/900MB, 1, 4, CPU/2)`。
  - 单次路径内部只切 2–3 块做进度（每块都要重新解析源 PDF，120 页按 6 页切会多花 80 秒）。
  - 引擎堆按物理内存 1/16 分配（1–2GB）。`OutOfMemoryError` 属于 `Error`，转换任务显式捕获后置为 `FAILED`（`OUT_OF_MEMORY`）并给出可读提示，避免任务停留在 `RUNNING`。`PDFConverter.close()` 不使用 try-with-resources，防止关闭再次失败时 `Self-suppression not permitted` 掩盖真实错误。
- **前端兜底**：所有引擎请求带 20 秒超时；转换轮询连续失败 5 次或 180 秒无进度变化即判定异常，停止等待并提示重试/拆分文档。
- **合并**：`OFDMerger`（ofdrw-tool），按页范围选择。
- **拆分**：基于 `OFDMerger` 的页选择能力逐区间导出（M3 验证后定稿）。

---

## 6. 桌面端设计（Electron）

### 6.1 进程职责

- **Main**：窗口生命周期、原生对话框、引擎进程管理、日志、单实例锁、文件关联启动参数与每用户注册表注册。
- **Preload**：仅暴露白名单 API（`pickDocument`、`getBackendInfo`、`onBackendStatus`、`revealPath`、`getPathForFile`、待打开文件队列、Windows 集成、应用版本）。
- **Renderer**：纯 UI，无 Node 权限，不直接读文件系统。

### 6.2 安全基线

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 禁止 `window.open`、外部导航、`webview`；外链交给系统浏览器。
- CSP：`default-src 'self'`；`img-src`/`connect-src` 仅允许自身与 `http://127.0.0.1:*`；开发期额外放行 Vite HMR。
- 已实测：渲染进程 `require` / `process` 均不可见，`window.open` 被拦截，CSP 生效。
- 原生对话框选择文件；渲染进程不能拼任意路径去写文件（写操作仅在 M2 后通过“保存对话框”授权路径）。
- 发布前检查：依赖审计、ASAR 完整性、安装包 SHA256。

### 6.3 视觉方向

- 关键词：**清晰、专业、低干扰**；避免后台管理系统观感与过度装饰。
- 品牌素材：角色插画仅用于空状态、引擎启动与关于页；阅读与处理界面不使用大幅插画。
- 色板：
  - 背景奶油纸 `#F6F2E7`，卡片纸白 `#FFFDF7`，正文墨绿黑 `#1D2A22`；
  - 品牌豆绿 `#2F7A4F`，深豆 `#215C3B`，豆雾 `#E4F0E7`，眼金 `#E4B54B`；
  - 阿豆灰 `#6E777B`、鼻粉 `#E8A6A0`（仅吉祥物/微点缀）、印章红 `#B4472F`；
  - 分割线 `#E4DED0`。
- 标识：使用正面对称的灰白猫头像（灰蓝面罩、白色鼻梁/胸口、金眼、粉鼻），白色圆角底；避免裁切碎片与几何尖角；输出 `brand-mark.png` 与多尺寸 ICO（`desktop/build/icon.ico`）。
- 吉祥物：`mascot-empty.webp` 用于空状态/关于，`mascot-loading.webp` 用于引擎启动；透明背景，阅读器与转换/合并列表不放大幅猫图。
- 字体：系统字体栈（Windows 优先“微软雅黑 UI”/“Segoe UI”），保持离线与体积。
- 布局：左侧 236px 应用导航（可折叠为 72px 图标栏）；所有 tab 使用统一的 50px 单行页头——查看器为文档标签栏，批量/合并/设置/空状态为“标题 + 内联说明”；查看器文档信息与操作合并为单行紧凑工具栏；阅读区左侧“缩略图 / 目录”导航面板、中间连续页面画布；底部悬浮缩放/页码工具条；空状态与加载态均有明确反馈。
- 精简：侧栏导航为“文档查看 / 批量转换 / 合并文档 / 设置 / 关于”，Windows 文件关联放在独立“设置”页；引擎详细信息仍在“关于”弹层。
- “关于”：展示版本、MIT 许可、Java/ofdrw/Spring Boot/Electron 版本、本地运行状态、开源组件摘要、第三方声明与完整许可文本入口。
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
10. 合并：左侧“合并文档”标签页；拖入或选择多个 OFD/PDF，拖动左侧手柄或上下按钮调整顺序，选择输出 OFD/PDF 与保存位置后开始；显示总进度、取消、结果页数/体积/告警，完成后可直接查看或在文件夹中定位。
11. 多标签：查看器顶部标签栏，支持点击切换、关闭、`+` 打开新文档；批量转换/合并列表的“查看”按钮直接打开或激活对应标签；最多 8 个标签。
12. 设置：左侧“设置”独立页，包含 Windows 文件关联（注册/修复、设为默认、系统设置、移除）和本地/隐私说明；与“关于”分离。
13. 关于：展示版本信息与开源许可摘要，可打开第三方声明、MIT 许可和随包许可目录。

### 6.5 版本与安装升级

- 版本以 `desktop/package.json` 为主源；后端 `pom.xml`、`application.yml`、Inno `AppVersion` 同步。构建脚本把版本传给 ISCC，安装包文件名与 `VersionInfoVersion` 使用同一版本。
- Inno Setup 使用固定 `AppId`，启用 `UsePreviousAppDir` / `UsePreviousTasks`，同版本或更高版本安装时按升级处理并保留安装目录、任务选择；卸载信息显示当前版本。
- 安装任务“关联 .ofd / .pdf 文件类型”默认勾选；取消勾选会清理旧关联并写入 `optedOut`，应用启动不自动回写。

### 6.6 开源许可展示

- 运行时组件、版权声明与许可名汇总在 `THIRD-PARTY-NOTICES.md`；完整许可文本与 Apache NOTICE 汇总随包放在 `resources/notices/licenses/`。
- “关于”提供“第三方声明 / MIT 许可 / 打开许可目录”入口；Electron 的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html` 保留在安装目录。
- 组件清单覆盖 Electron、React、Node.js、ofdrw、PDFBox、Spring Boot、Tomcat、Jackson、Batik、BouncyCastle、Logback、UJMP、TwelveMonkeys、Jaxen、Dom4j、Inno Setup 等。

---

## 7. 打包与分发

### 7.1 组成

```
阿豆OFD/
├─ 阿豆OFD.exe                 Electron 主程序
├─ resources/
│  ├─ app.asar                 渲染进程与主进程代码
│  ├─ backend/adou-ofd-backend.jar
│  ├─ fileicons/               ofd-file.ico / pdf-file.ico（Windows 文件类型图标）
│  └─ jre/                     Java 25 运行时（scripts/build-jre.mjs 用 jlink 裁剪，约 54MB）
└─ ...
```

### 7.2 构建流程

1. `npm run backend:build`（`mvn -DskipTests package`）产出可执行 fat jar。
2. `npm run jre:build`（`scripts/build-jre.mjs`）用 jlink 生成最小 JRE：17 个模块（含 `java.desktop`、`java.xml`、`jdk.charsets`、`jdk.localedata`、`jdk.crypto.ec`），`--include-locales=zh,en`，产物约 54MB。
3. `npm run package:inno` 先由 electron-builder 生成临时 `win-unpacked`（注入 jar、jre、fileicons），再调用 Inno Setup 6 编译安装包；`package:win` 保留 NSIS 备用构建。
4. 安装向导任务页提供“关联 .ofd / .pdf 文件类型”（默认勾选，升级时保留选择）：勾选时写入两个 ProgID、DefaultIcon、OpenWithProgids、RegisteredApplications/Capabilities；取消勾选时清理这些注册项并写入 `optedOut`，应用启动不会再自动关联。
5. 安装包按用户安装（HKCU，无需管理员），支持自定义目录；卸载时恢复注册前的 `.ofd` 默认值并删除关联注册项。

### 7.3 实测与待办

- 已实测（2026-11-02）：jlink 精简 JRE 54MB；免安装目录约 466MB；Inno Setup 安装包 180.8MB（`阿豆OFD-0.7.1-x64-inno.exe`，SHA256 `4baae9d3…`）；NSIS 备用包 192MB。打包版使用 `resources/jre/bin/java.exe` 启动（1.24 秒），完整 UI 冒烟通过（含单文件/批量转换）。
- Inno 安装任务实测：勾选关联后写入 `AdouOFD.OFD`/`AdouOFD.PDF` 与对应 ICO；取消关联升级后注册项清理；应用启动不自动回写；静默卸载后无残留；原有 WPS `.ofd` 默认未被覆盖。
- 当前阶段不做代码签名、不采购证书；发布包保持 NotSigned（SmartScreen 会提示“未知发布者”），通过 SHA256 校验完整性。
- 安装包进一步瘦身（目标 <150MB，可评估 7z 字典/UPX/裁剪 Electron 语言包）。
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
  - 转换：OFD↔PDF、分片不丢页、OOM 落 FAILED、排队/运行中取消；
  - 合并：PDF/OFD 顺序保持、同名 OFD 重复加入、混合格式双向、参数校验、取消、OOM、缺失资源占位修复、DrawParam 继承展开与无效 ColorSpace 清理；
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
| PDF 字体/图像/旋转兼容性 | 页面空白或方向错误 | PDFBox 3.0.8；CropBox/旋转参与尺寸计算；真实 PDF 已回归 |
| iText 7（AGPL）随 ofdrw-converter 传递依赖 | 分发许可风险 | 已解决：ofdrw 2.5.1 移除 iText，依赖树无 AGPL 组件 |
| PDF→OFD 字体/排版保真度 | 转换效果不达预期 | 明确“保版面、可阅读”目标；扫描件按图嵌入；输出质量报告 |
| 大文件/恶意 OFD 导致内存或路径穿越 | 稳定性/安全 | 限制解压大小（ofdrw `setZipFileMaxSize`）、会话隔离、临时目录白名单、超时 |
| Electron + 本地 HTTP 被本机其他程序调用 | 数据泄露/滥用 | 随机端口 + 每次启动 Token + 仅回环；后续改 IPC/自定义协议 |
| 安装包体积与启动速度 | 体验 | jlink 裁剪已完成（272MB→Inno 181MB / NSIS 192MB）；后续评估 Electron 语言包裁剪与 7z 字典 |
| 代码签名 | 信任与安装成功率 | 已准备开源代码签名申请材料（SignPath / Certum 等），当前构建仍未签名；发布提供 SHA256 校验，签名流程见 `docs/CODE-SIGNING.md` |
| OFD→PDF 矢量模式嵌入完整中文字体 | 输出体积过大（4 页示例约 78MB，19.6MB/页） | 已知问题；可切换图像导出；后续评估 `PDFExporter`（同类文档约 19.6MB）或字体子集化 |

---

## 11. 许可与合规（重要）

- 应用自身代码以 **MIT License** 发布（`LICENSE`）。
- Electron / React / Node.js / ofdrw / SLF4J / BouncyCastle：MIT（BouncyCastle 为 MIT 风格）。
- PDFBox / FontBox / Batik / Spring Boot / Tomcat / Jackson / Apache Commons 等：Apache-2.0。
- Logback：EPL-2.0 或 LGPL-2.1；Jakarta Annotation API：EPL-2.0 或 GPL-2.0 with Classpath Exception。
- UJMP Core：LGPL-3.0（未修改的传递依赖）；TwelveMonkeys/Jaxen：BSD-3-Clause；Dom4j：BSD 风格（Plexus）。
- **JSON-java 已排除**：UJMP 传递引入的 `org.json:json`（JSON License，非 OSI 批准）已在 `backend/pom.xml` 中排除，发行包不含该组件。
- **iText 已移除**：ofdrw 2.5.1 起不再依赖 iText，依赖树无 AGPL 组件；公开分发不再受 AGPL 约束。
- 版权与许可全文：`THIRD-PARTY-NOTICES.md` + `licenses/`；打包时复制到 `resources/notices/`，并可从“关于”查看。Apache 组件的 NOTICE 汇总在 `licenses/APACHE-NOTICES.txt`。
- 隐私政策：`PRIVACY.md`，说明离线处理、本地日志/临时文件/注册表位置和清理方式；安装包复制到 `resources/notices/PRIVACY.md`，关于页可直接查看。
- 安全政策：`SECURITY.md`，支持版本、私密漏洞报告范围与响应时间。
- 代码签名政策：`docs/CODE-SIGNING.md` 说明签名提供方、团队角色、人工批准流程、签名范围与验证方式；签名步骤集成在 `release.yml`，由 `SIGNPATH_ENABLED` 控制开关。
- 社区文档：`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SUPPORT.md`、`CHANGELOG.md`；GitHub CI/Release 工作流位于 `.github/workflows/`。

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
- [x] Windows Inno Setup 安装包可生成（180.8MB），安装任务可选择关联文件类型；打包产物使用内置 JRE 正常启动。

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
- [x] 全文搜索：OFD/PDF 跨页扫描、增量结果、片段/页码、页面内高亮、当前命中强调、`Ctrl+F`、Enter/Shift+Enter、Esc、区分大小写、进度与取消（实测唯一命中跳第 4 页；常见词 150 处、当前项 1 条、页面命中 750 个字形段）。
- [x] 打印面板：打印机列表/系统默认、份数、灰度、全部/当前页/自定义范围、奇偶页、逆序、纸张大小/方向/边距、每张 2/4/6/8/9 页、按行/按列、边框、双面、实时预览与分张导航；OFD 示例默认 4 页/4 张，2-up 为 4 页/2 张，8-up 为 2 列 × 4 行（输出 1 页 A4、4 张页面图）；自定义 2-4 + 逆序 + A5 横向 + 无边距 + 灰度输出 3 页 209.9×148.2mm（首页为第 4 页）；PDF 示例灰度输出 3 页 A4；范围 9-12 被判无效并禁用打印；`Ctrl+P` 可打开面板；转换结果（3 页）、批量结果（4 页）与合并结果（7 页）的“打印”入口均能直接加载并打开面板，且不新增标签。
- [x] Windows 文件关联：安装版自动注册 `.ofd` / `.pdf` 打开方式与默认应用能力；不覆盖已有 UserChoice 默认应用；第二实例打开文件并入当前窗口；“关于”支持注册/修复、设为默认、系统设置与移除；卸载脚本清理注册项。
- [x] Inno 安装选项：勾选“关联 .ofd / .pdf 文件类型”时写入两个 ProgID、DefaultIcon、OpenWithProgids、Capabilities；取消关联升级时清理注册项并写入 `optedOut`，应用启动不自动回写；静默卸载后无残留。
- [ ] 页面旋转、最近文件（M1.2）。

### 12.2 PDF 预览验收

- [x] 原生对话框与拖拽均支持 .pdf；空状态提供 PDF 示例。
- [x] 正确读取 PDF 页数、页面尺寸与旋转（含横向页面）。
- [x] PDF 页面按 DPI 渲染 PNG，缩略图、连续滚动、缩放、翻页、页码跳转全部可用。
- [x] 加密 PDF 返回友好提示，不影响其他文档打开。
- [x] 真实 PDF 文件打开与渲染验证通过。
- [x] UI 冒烟覆盖 PDF 示例：3 页、3 个缩略图、翻页到第 2 页。
- [x] PDF 文本选择/搜索：逐字文字层可选；全文搜索复用统一搜索服务，PDFBox 文字提取后跨页匹配、片段与页面高亮正常。
- [ ] PDF 注解显示（M1.2）。

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
| 2026-11-02 | 后端回归 | JDK 25.0.5 | ✅ | 39/39 测试通过（转换 13 项 + 合并 8 项 + 资源修复 2 项 + 样式修复 1 项 + 全文搜索 6 项，含顺序、同名重复、混合格式、取消、OOM、跨页/大小写/换行短语/命中上限） |
| 2026-11-02 | 全文搜索 UI | Electron 45.1.0 | ✅ | OFD 示例：唯一词“仅用于功能演示”命中 1 处并自动定位第 4 页，当前命中高亮；常见词“阿豆OFD”命中 150 处，结果列表 150 行、下一处 2/150、当前项唯一高亮、页面高亮 750 个字形段；PDF 搜索由后端测试覆盖 |
| 2026-11-02 | 全文搜索真实文件 | JDK 25.0.5 | ✅ | 真实电子发票 OFD（1 页）关键词命中 1 处 / 144ms；404 页 PDF 用户手册“电池”命中 241 处、扫描 404/404 页、失败 0 页 / 4.76s（34 次轮询），片段与页码正确 |
| 2026-11-02 | Windows 文件关联（打包版） | Windows 11 / Electron 45.1.0 | ✅ | 临时打包版启动自动注册 HKCU 两个 ProgID（OFD/PDF）、OpenWithProgids、RegisteredApplications/Capabilities；About 显示“已注册”；第二实例打开真实发票并聚焦；移除后三项键值均不存在，原有 `.ofd` 默认应用未被覆盖，配置已恢复 |
| 2026-11-02 | Windows 文件图标 | Windows 11 / ICO 16–256px | ✅ | `AdouOFD.OFD` / `AdouOFD.PDF` 的 DefaultIcon 分别指向随包 `fileicons/ofd-file.ico`、`pdf-file.ico`；`.ofd`/`.pdf` OpenWith 与 Capabilities 映射到对应 ProgID；图标 16px 可辨、24px 起清晰；卸载清理后无遗留 |
| 2026-11-02 | Inno Setup 安装包 | Inno Setup 6 / Windows 11 | ✅ | 安装包 180.8MB（SHA256 `22ee7843…`）；勾选关联安装后两个 ProgID/DefaultIcon/OpenWith/Capabilities 正确；同目录取消关联升级后注册项清理并写 `{"optedOut":true}`；启动安装版不自动回写；静默卸载后安装目录、配置与注册项均无残留；WPS `.ofd` 默认未覆盖 |
| 2026-11-02 | Inno 版本升级 | 0.6.0 → 0.7.0 | ✅ | 0.6.0 安装到临时目录（勾选关联）；0.7.0 静默升级后版本 0.7.0、目录不变、后端 jar 为 0.7.0；未传 `/TASKS` 时保留已有文件关联与 `optedOut:false`；notices/licenses 随包存在；卸载后无残留 |
| 2026-11-02 | 0.7.1 发布包 | Inno Setup 6 | ✅ | `阿豆OFD-0.7.1-x64-inno.exe` 180.8MB，SHA256 `4baae9d3…`；统一 50px 单行页头、功能化文案、隐私政策、GitHub CI/Release 工作流、签名申请材料；39/39 后端测试与 UI 冒烟通过 |
| 2026-11-02 | GitHub 发布 | GitHub Actions | ✅ | 公开仓库 `Zzuser/adouOFD`；CI 成功；Release `v0.7.1` 已发布，安装包 `adou-ofd-0.7.1-x64-inno.exe`（CI SHA256 `772c8d72…`）；附件含 PRIVACY/LICENSE/THIRD-PARTY/SHA256/release notes；当前未签名 |
| 2026-11-02 | 0.8.0 本地安装包 | Inno Setup 6 | ✅ | `阿豆OFD-0.8.0-x64-inno.exe` 180.8MB，SHA256 `4e427dc0…`，FileVersion/ProductVersion 0.8.0，未签名；应用内打印面板、结果快捷打印、N-up 2/4/6/8/9（8 页为 2 列 × 4 行）；39/39 后端测试与完整 UI 冒烟通过 |
| 2026-11-02 | GitHub 发布 0.8.0 | GitHub Actions | ✅ | Release `v0.8.0` 已发布；安装包 `adou-ofd-0.8.0-x64-inno.exe` 189,497,699 B，CI SHA256 `35bdd6a5…`（与附件 `SHA256-0.8.0.txt` 一致）；附件含 CODE-SIGNING/LICENSE/PRIVACY/THIRD-PARTY/RELEASE-NOTES；CI 与 Release 工作流均成功；未签名 |
| 2026-11-03 | 后端回归 0.9.0 | JDK 25.0.5 | ✅ | 49/49 测试通过；新增拆分/插页 8 项与预览会话 2 项，覆盖 OFD/PDF 按页/分块/区间拆分、混合格式插页、页数校验、参数校验与预览会话隔离 |
| 2026-11-03 | 拆分与插页 UI | Electron 45.1.0 | ✅ | 7 页 OFD：每 2 页拆分 4 个文件，区间 `1-3,5` 拆分 2 个文件；默认插页输出 9 页，指定第 3 页前插入输出 8 页；预览分组标记、未选页淡化、插入位置虚线均正确；原有 UI 冒烟通过 |
| 2026-11-02 | 单实例/命令行打开 | Electron 45.1.0 | ✅ | 首次启动直接传入真实发票：1 个标签、1 页、文件名正确；运行中启动第二实例传入转换结果路径，文件并入当前窗口并新增标签；关闭后标签数恢复 |
| 2026-11-02 | 精简 JRE | jlink 25.0.5 | ✅ | 17 个模块 54MB；精简 JRE 直启后端：健康检查 0.6.0、4 页渲染、1997 段文字、PDF→OFD 228ms、OFD→PDF 1181ms |
| 2026-11-02 | 打印面板（OFD / PDF） | Electron 45.1.0 | ✅ | OFD 示例默认 4 页/4 张 A4；2-up 输出 2 页、每页 2 张页面图，按列预览顺序 `[1,3,2,4]`；范围 2-4 + 逆序 + A5 横向 + 无边距 + 灰度输出 3 页 209.9×148.2mm（首页为第 4 页）；PDF 示例灰度输出 3 页 A4；无效范围 9-12 禁用打印；`Ctrl+P` 打开面板；转换/批量/合并结果打印入口分别加载 3/4/7 页且不新增标签；系统静默发送需用户用实际打印机验证 |
| 2026-11-02 | 0.6.0 打包 | electron-builder 26.18.0 | ✅ | 安装包 192MB（SHA256 `98a5193b…`），解包 466MB；打包版使用 `resources/jre` 启动 1.24s，完整 UI 冒烟通过；未签名 |
| 2026-11-02 | 合并文档 UI | Electron 45.1.0 | ✅ | 2 个文件（OFD 4 页 + PDF 3 页）；下移调整顺序生效；合并为 OFD 输出 7 页 / 195.2KB / 1.3s；结果可在阅读器打开 |
| 2026-11-02 | 多标签与查看入口 | Electron 45.1.0 | ✅ | 批量列表“查看”打开结果、合并列表“查看”打开输入；2 个标签切换正常；多标签后页面滚动/缩略图正常；全部标签可关闭并回到空状态 |
| 2026-11-02 | 品牌 UI | Electron 45.1.0 | ✅ | 混合版应用图标/侧栏标识、空状态吉祥物、引擎启动插画、关于页吉祥物与开源许可；奶油纸配色上线；完整 UI 冒烟通过 |
| 2026-11-02 | 合并缺失资源修复 | JDK 25.0.5 | ✅ | 构造缺失图片资源的 OFD + PDF 合并为 OFD：自动补 3 个占位文件，输出 3 页 / 374KB；合并结果可打开、3 页均可渲染、文字层 176 段 |
| 2026-11-02 | 合并样式修复 | JDK 25.0.5 | ✅ | 真实电子发票 + OFD + PDF 合并：自动展开 1 处 DrawParam 继承、清理 1 处无效 ColorSpace；渲染页面表格红框完整，不再丢失 |
| 2026-10-30 | 界面精简与关于 | Electron 45.1.0 | ✅ | 侧栏仅保留文档查看/关于；引擎详情移入关于弹层；空状态精简；关于弹层展示版本与许可 |

## 14. 决策记录（ADR 摘要）

1. **ADR-001 采用 Java sidecar 而非 JNI**：调试成本低、可独立测试、崩溃隔离；代价是多一个进程与本地 HTTP 攻击面，用回环 + Token 收敛。
2. **ADR-002 使用 ofdrw-full 2.5.1**：最新稳定、模块完整，已移除 iText；升级必须跑 §9 回归。
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
- 引擎：`backend/`（Spring Boot 4.0.9 + ofdrw 2.5.1 + PDFBox 3.0.8，49 个测试全绿；OFD/PDF 统一句柄、目录、文字层、全文搜索、格式转换、合并、拆分、插页、页面预览、缺失资源与样式修复）。
- 桌面端：`desktop/`（Electron 45.1.0 + React 19 + TS 7；连续滚动、缩略图、目录、缩放、页码、全文搜索、应用内打印面板、多标签查看、Windows 文件关联、批量转换、合并文档、应用导航折叠）。
- Windows 集成：`desktop/src/main/windows-integration.ts`（HKCU 注册/状态/移除）、`document-args.ts`（文件关联启动参数）、`desktop/build/installer.nsh`（卸载清理）、`desktop/build/fileicons/`（OFD/PDF 文件图标 ICO + PNG）。
- 合规与社区：`PRIVACY.md`、`SECURITY.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SUPPORT.md`、`CHANGELOG.md`、`docs/CODE-SIGNING.md`、`.github/workflows/ci.yml`、`.github/workflows/release.yml`。
- 工具链：`scripts/setup-jdk.mjs`、`scripts/build-backend.mjs`、`scripts/build-inno.mjs`、`scripts/inno/adou-ofd.iss`、`scripts/install-electron.mjs`、`scripts/electron-vite.mjs`、`scripts/smoke-ui.mjs`、`scripts/stress-fixtures.mjs`、`scripts/stress-backend.mjs`、`scripts/stress-ui.mjs`。
- 界面截图：`docs/screenshots/`（空状态、关于、设置、第三方许可、隐私政策、OFD/PDF 阅读器、目录、折叠、文字选择、全文搜索、打印面板、文件图标、批量转换、合并文档、800 页压测）。
- 许可：[LICENSE](../LICENSE)、[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)、`licenses/`（完整许可文本与 Apache NOTICE 汇总）。
- 压力夹具：`backend/src/test/java/com/adou/ofd/StressFixtureGenerator.java`（生成到 `.tools/stress`，不纳入版本库）。
- 安装包：本机已验证 Inno Setup 生成与运行（0.8.0，未签名，180.8MB，含文件关联安装任务；NSIS 备用包约 192MB；均不纳入版本库）。

### 15.2 本轮完成

- 应用左侧导航折叠（236px ↔ 72px，状态持久化）。
- 阅读器导航面板“缩略图 / 目录”双页签；PDF Outline / OFD Outlines+Bookmarks 解析、跳页、高亮。
- OFD 改为会话级 Reader + ImageMaker，多页渲染性能显著提升。
- 大文件压力测试与报告：800 页 PDF、100 页/20MB 图片 PDF、91 页 OFD。
- 合并文档：OFD/PDF 混合输入、列表顺序拖动/上下调整、输出格式选择、进度/取消/结果；合并任务与转换共享单工作线程。
- 多标签查看与列表查看入口：最多 8 个标签，切换保留状态；批量/合并列表可直接“查看”文件或结果。
- 页面文字层：PDF/OFD 框选复制，保留换行。
- 全文搜索、Windows 文件关联与独立文件图标、单实例双击打开。
- 应用内打印：阅读器“打印”/`Ctrl+P` 打开面板，支持打印机/份数/灰度/范围/奇偶/逆序/纸张/方向/边距/N-up/双面与实时预览，直接发送到所选打印机；OFD/PDF 共用。转换、批量与合并结果区提供快捷打印入口。
- Inno Setup 安装包与安装任务、“设置”独立页、关于页开源许可声明、0.7.1 文案与页头统一。

### 15.3 待用户确认

1. **下一阶段优先级**：全文搜索、Windows 文件关联、设置页、Inno 安装包与打印第一档（面板/预览/N-up/纸张）已完成；下一步做页面旋转、最近文件、OFD 拆分，以及打印第二档（水印、页码、页眉页脚、多文档打印）。
2. **代码签名**：已确认当前阶段不做代码签名、不采购证书；发布包保持未签名。
3. **OFD→PDF 字体体积**：是否迁移到 `PDFExporter` 或改用图像导出，待发布后单独评估。
4. **视觉与图标**：当前豆绿/米白风格、缩略图 + 目录 + 悬浮缩放条布局是否保留。

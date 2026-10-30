# 第三方组件与许可说明

阿豆OFD 的应用代码以 MIT 许可发布（见 [LICENSE](LICENSE)）。项目使用或随安装包分发以下第三方组件，它们各自保留原有许可，不因本项目的 MIT 许可而改变。

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| Electron | 桌面壳 | MIT |
| React / React DOM | 渲染进程 UI | MIT |
| electron-vite / Vite | 构建工具 | MIT |
| TypeScript | 类型系统 | Apache-2.0 |
| Spring Boot / Spring Framework | 本地引擎框架 | Apache-2.0 |
| ofdrw / ofdrw-full | OFD 读取、渲染、版式与合并 | Apache-2.0 |
| Apache PDFBox / FontBox | PDF 读取、渲染、导出 | Apache-2.0 |
| Apache Batik | SVG 输出支持（ofdrw 依赖） | Apache-2.0 |
| BouncyCastle | PDF 加密/签章相关（传递依赖） | MIT 风格 |
| **iText 7** | **ofdrw-converter 的传递依赖（当前未直接使用其导出路径）** | **AGPL-3.0** |
| NSIS / 7-Zip | Windows 安装包构建工具 | 各自开源许可 |

## 重要说明：iText 7 / AGPL

`ofdrw-converter` 依赖 iText 7，而 iText 7 采用 **AGPL-3.0**。这意味着：

- **仅公开源代码**（本仓库）并不等于可以无条件分发包含 iText 的二进制安装包。
- 若公开发布预编译安装包，需要满足 AGPL-3.0 的义务，或取得 iText 商业授权，或在不包含 iText 的前提下重新构建/裁剪依赖。
- 本项目当前只使用 PDFBox 路径做 PDF 导出；后续会评估从依赖树和打包产物中排除 iText，并在发布安装包前完成许可审查。

## 字体

应用不内置商业字体文件。示例文档使用本机 Windows 字体生成，仅在运行时读取；用户文档中的字体由原文档自带或由本机字体库提供。

## 免责声明

本软件按“现状”提供，不提供任何明示或暗示担保。用户应自行确认对所处理文档拥有合法使用权，并遵守所在地区法律法规及文档相关方要求。

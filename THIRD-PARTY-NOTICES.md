# 第三方组件与许可说明

阿豆OFD 的应用代码以 MIT 许可发布（见 [LICENSE](LICENSE)）。本文件汇总随安装包分发的第三方组件、版权归属与许可，完整许可文本随安装包放在 `notices/licenses/` 目录（源码仓库为 `licenses/`）。

本文件不改变任何第三方组件原有的许可；如本文件与组件自带的许可文件不一致，以组件自带许可为准。

## 一、运行时组件

### MIT

| 组件 | 用途 | 版权/许可文件 |
| --- | --- | --- |
| Electron | 桌面壳 | `licenses/Electron-LICENSE.txt`；Electron 分发包内还包含 `LICENSES.chromium.html` |
| React / React DOM / Scheduler | 渲染进程 UI | `licenses/React-LICENSE.txt` |
| Node.js（Electron 内置） | JavaScript 运行时 | `licenses/Node-LICENSE.txt` |
| ofdrw / ofdrw-full 2.5.1 | OFD 读取、渲染、版式、合并 | MIT；https://github.com/ofdrw/ofdrw |
| SLF4J 2.0.20 / JUL-to-SLF4J | 日志门面 | `licenses/SLF4J-LICENSE.txt` |
| Bouncy Castle 1.85 | 密码学与证书支持（ofdrw 传递依赖） | `licenses/Bouncy-Castle-LICENSE.md` |

### Apache License 2.0

| 组件 | 用途 |
| --- | --- |
| Apache PDFBox / FontBox / JBIG2 ImageIO | PDF 读取、渲染、导出 |
| Spring Boot / Spring Framework | 本地引擎框架 |
| Apache Tomcat Embed | 内嵌 HTTP 服务 |
| Jackson（Databind / Core / Annotations） | JSON 序列化 |
| Micrometer | 指标观测 API |
| SnakeYAML | YAML 配置解析 |
| Apache Commons Compress / Codec / IO / Lang3 | 压缩、编码与工具类 |
| Apache Batik / XML Graphics Commons / xml-apis | SVG 与图形输出（ofdrw 依赖） |
| Zip4j | OFD 包解压（ofdrw 依赖） |
| Log4j API / Log4j-to-SLF4J | 日志桥接 |

完整 Apache-2.0 文本见 `licenses/Apache-2.0.txt`。各 Apache 组件随 jar 携带的 NOTICE 文本汇总见 `licenses/APACHE-NOTICES.txt`。

### BSD-3-Clause / BSD 风格

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| TwelveMonkeys ImageIO | TIFF 图像读取（ofdrw 依赖） | BSD-3-Clause |
| Jaxen | XPath（ofdrw 依赖） | BSD-3-Clause |
| Dom4j | XML 处理（ofdrw 依赖） | BSD 风格（Plexus） |

BSD-3-Clause 文本见 `licenses/BSD-3-Clause.txt`；各组件版权归其作者所有，项目链接见组件发布页。

### EPL / LGPL

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| Logback Classic / Core 1.5.38 | SLF4J 实现 | EPL-2.0 或 LGPL-2.1（双许可） |
| Jakarta Annotation API 3.0.0 | Jakarta 注解 API | EPL-2.0 或 GPL-2.0 with Classpath Exception |
| UJMP Core 0.3.0 | 矩阵运算（ofdrw-converter 传递依赖） | LGPL-3.0 |

- LGPL-2.1 全文：`licenses/LGPL-2.1.txt`。
- LGPL-3.0 全文：`licenses/LGPL-3.0.txt`；UJMP Core 为未修改的依赖；源码与替换方式见 https://github.com/ujmp/ujmp 。
- EPL-2.0 全文 URI：https://www.eclipse.org/legal/epl-2.0/ ，说明见 `licenses/EPL-2.0-REFERENCE.txt`（EPL-2.0 允许以 URI 提供许可文本）。

### 其他

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| JSON-java 20141113 | JSON 处理（ofdrw 传递依赖） | JSON License，全文见 `licenses/JSON-LICENSE.txt` |
| Inno Setup 6（安装程序运行时） | Windows 安装程序 | Inno Setup License，全文见 `licenses/Inno-Setup-LICENSE.txt` |

## 二、构建工具（不随应用运行）

| 组件 | 许可 |
| --- | --- |
| electron-vite / Vite | MIT |
| TypeScript | Apache-2.0 |
| electron-builder | MIT |
| NSIS / 7-Zip | 各自开源许可 |
| Maven / Apache Maven Wrapper | Apache-2.0 |
| Temurin OpenJDK 25（构建与 jlink 运行时） | GPL-2.0 with Classpath Exception |

## 三、Electron / Chromium / Node.js

Electron 分发包内含 Chromium、Node.js 与 FFmpeg 等组件。Electron 安装目录中的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html` 保留完整版权与许可信息，未做删改。阿豆OFD 不修改 Electron、Chromium 或 Node.js 源码。

## 四、iText 说明

ofdrw 2.5.1 起已彻底移除 iText；本项目使用 ofdrw 2.5.1 + Apache PDFBox 3.0.8，依赖树中不包含 AGPL 组件。

## 五、字体

应用不内置商业字体文件。示例文档使用本机 Windows 字体生成，仅在运行时读取；用户文档中的字体由原文档自带或由本机字体库提供。

## 六、免责声明

本软件按“现状”提供，不提供任何明示或暗示担保。用户应自行确认对所处理文档拥有合法使用权，并遵守所在地区法律法规及文档相关方要求。

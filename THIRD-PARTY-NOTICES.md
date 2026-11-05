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
| SLF4J 2.0.20 / SLF4J Simple | 日志门面与日志实现 | `licenses/SLF4J-LICENSE.txt` |
| Bouncy Castle 1.85 | 密码学与证书支持（ofdrw 传递依赖） | `licenses/Bouncy-Castle-LICENSE.md` |
| react-markdown / remark-gfm / remark-frontmatter / remark-math / rehype-highlight / rehype-slug / rehype-katex / KaTeX | Markdown 预览、公式渲染与 PDF 导出 | 均为 MIT |

### Apache License 2.0

| 组件 | 用途 |
| --- | --- |
| Apache PDFBox / FontBox / JBIG2 ImageIO | PDF 读取、渲染、导出 |
| Javalin 6.7.0 / Jetty 11.0.25 | 本地 HTTP 引擎（Jetty 为 Apache-2.0 / EPL-2.0 双许可，本项目按 Apache-2.0 使用） |
| Kotlin stdlib 1.9.25 | Javalin 运行时依赖 |
| Jackson（Databind / Core / Annotations / JSR-310） | JSON 序列化 |
| Apache Commons Compress / Codec / IO / Lang3 | 压缩、编码与工具类 |
| Apache Batik / XML Graphics Commons / xml-apis | SVG 与图形输出（ofdrw 依赖） |
| Zip4j | OFD 包解压（ofdrw 依赖） |

完整 Apache-2.0 文本见 `licenses/Apache-2.0.txt`。各 Apache 组件随 jar 携带的 NOTICE 文本汇总见 `licenses/APACHE-NOTICES.txt`。

上游项目与许可页面：Apache PDFBox <https://pdfbox.apache.org/> · Javalin <https://javalin.io/> · Eclipse Jetty <https://jetty.org/> · Apache Batik <https://xmlgraphics.apache.org/batik/> · Zip4j <https://github.com/srikanth-lingala/zip4j> · Jackson <https://github.com/FasterXML/jackson>（均为 Apache-2.0）。

### BSD-3-Clause / BSD 风格

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| TwelveMonkeys ImageIO | TIFF 图像读取（ofdrw 依赖） | BSD-3-Clause |
| Jaxen | XPath（ofdrw 依赖） | BSD-3-Clause |
| Dom4j | XML 处理（ofdrw 依赖） | BSD 风格（Plexus） |
| highlight.js | 代码块语法高亮（rehype-highlight 依赖） | BSD-3-Clause |

BSD-3-Clause 文本见 `licenses/BSD-3-Clause.txt`；各组件版权归其作者所有，项目链接见组件发布页。

### LGPL

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| UJMP Core 0.3.0 | 矩阵运算（ofdrw-converter 传递依赖） | LGPL-3.0 |

- LGPL-3.0 全文：`licenses/LGPL-3.0.txt`；UJMP Core 为未修改的依赖；源码与替换方式见 https://github.com/ujmp/ujmp 。
- Jetty 为 Apache-2.0 / EPL-2.0 双许可，本项目选择 Apache-2.0，不启用 EPL-2.0 条款。

### 其他

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| Inno Setup 6（安装器编译器与解包桩） | Windows 安装程序 | Inno Setup License（非 OSI，宽松许可，允许自由再分发），全文见 `licenses/Inno-Setup-LICENSE.txt` |

> 旧版本曾通过 `org.ujmp:ujmp-core` 传递引入 JSON-java（JSON License，非 OSI 批准）。该依赖已在 `backend/pom.xml` 中显式排除，发行包不再包含该组件，`licenses/JSON-LICENSE.txt` 已删除。详见 §六·3。

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

## 六、许可核查声明

### 1. 应用与运行时库均为 OSI 批准的开源许可证

| 许可证 | OSI 批准 | 组件 |
| --- | --- | --- |
| MIT | 是 | Electron、React、Node.js、ofdrw、SLF4J、Bouncy Castle |
| Apache-2.0 | 是 | PDFBox / FontBox / JBIG2、Javalin、Jetty、Kotlin、Jackson、Batik、Zip4j、Commons |
| BSD-3-Clause | 是 | TwelveMonkeys ImageIO、Jaxen、Dom4j |
| LGPL-3.0 | 是 | UJMP Core（未修改的依赖） |

### 2. 无商业双授权、无 AGPL、无专有代码

- 依赖树中**不存在**“AGPL + 商业许可”“GPL + 商业许可”等商业双授权（commercial dual-licensing）模式的组件。
- ofdrw 2.4 之前依赖 iText（AGPL）；本项目使用的 ofdrw 2.5.1 已彻底移除 iText，依赖树中不含 AGPL 组件。
- 唯一的非 OSI 传递依赖（JSON-java，JSON License）已在 `backend/pom.xml` 中通过 `<exclusion>` 移除，`mvn dependency:tree` 复查结果为 0 命中。
- 项目自身代码为 MIT；不含维护者或其关联方发布的专有、闭源组件，也不含任何需要付费解锁的功能。

### 3. 非 OSI 许可证的处理

**（a）JSON-java（JSON License）—— 已从依赖树中移除。** 该许可含 “The Software shall be used for Good, not Evil” 条款，**不是 OSI 批准许可证**。它此前由 `ofdrw-converter → org.ujmp:ujmp-core:0.3.0` 传递引入（compile 作用域，会被打进 fat jar）。处理方式是在 `backend/pom.xml` 的 `ofdrw-full` 依赖上排除 `org.json:json`：

```xml
<exclusion>
  <groupId>org.json</groupId>
  <artifactId>json</artifactId>
</exclusion>
```

排除的安全性已逐层核对：`ujmp-core` 中只有孤立的 `org.ujmp.core.util.JsonUtil` 引用 `org.json`，ujmp 内部没有任何类引用 `JsonUtil`；ofdrw-converter 只使用 `org.ujmp.core.Matrix`、`DenseMatrix`、`DenseDoubleMatrix2D` 与 `DefaultDenseDoubleMatrix2DFactory`，运行期不会触达该工具类。排除后 `mvn dependency:tree` 中 `org.json:json` 命中数为 0，后端 54 个测试全部通过。`licenses/JSON-LICENSE.txt` 已随之删除。

**（b）Inno Setup 6 —— 构建工具链，不随应用运行。** 它是安装器编译器，仅在构建期使用；它生成的解包桩（setup loader）按设计内嵌在安装包中，属工具链组成部分，不是本项目的源代码组件。该许可为宽松许可，允许自由再分发与商业使用，无商业双授权，也不要求分发本项目源码。

## 七、免责声明

本软件按“现状”提供，不提供任何明示或暗示担保。用户应自行确认对所处理文档拥有合法使用权，并遵守所在地区法律法规及文档相关方要求。

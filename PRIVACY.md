# Privacy Policy / 隐私政策

**Project:** 阿豆OFD (ADou OFD)  
**Effective date:** 2026-11-04
**Maintainer:** Zzuser  
**Contact:** https://github.com/Zzuser/adouOFD/issues

## English

### 1. Summary

阿豆OFD is a free, offline Windows desktop application for reading, searching, converting and merging OFD and PDF documents. The application does not require an account and does not collect telemetry, analytics, advertising identifiers, or document content.

### 2. Document processing

- Documents are opened and processed locally on the user's computer.
- The application does not upload documents, page images, extracted text, or derived files to any server.
- The local Java engine listens only on `127.0.0.1` with a random per-launch access token.
- Converted, merged or exported files are written only to locations chosen by the user.

### 3. Network activity

**This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.**

- Reading, searching, converting and merging do not require network access.
- Encrypted PDF passwords are used only to open the document in memory; they are not stored on disk, written to logs, or sent anywhere except the local engine.
- The application does not implement accounts, cloud sync, remote logging, telemetry, advertising, or background/automatic update checks.
- When the user activates “Check for updates” in About, the app requests a version manifest over HTTPS from `minio.grout.cn` (test builds may use `testminio.grout.cn`). The request contains no document content, file paths, account identifiers, or telemetry. If the user chooses to download, the installer is saved to the Downloads folder and verified against the SHA256 value in the manifest before it is reported as complete.
- External links (for example, the GitHub repository or the Windows default-apps settings page) open only when the user activates them.

### 4. Local data

The application may create the following data on the user's computer:

- Settings, the recent-file list (file paths and display names only), and logs under `%APPDATA%\adou-ofd`, including local engine logs that may contain file paths and error messages.
- Temporary render caches and conversion intermediates under the operating system temporary directory.
- User-selected output files.
- Installers downloaded through “Check for updates”, saved to the user's Downloads folder.
- Per-user Windows registry entries under `HKCU\Software\Classes`, `HKCU\Software\RegisteredApplications` and `HKCU\Software\AdouOFD` when file associations are enabled.

This data stays on the device. The recent-file list can be cleared from the empty state; logs and settings can be deleted manually. Uninstalling the application removes its program files and file-association entries; residual logs under `%APPDATA%\adou-ofd` can be deleted manually.

### 5. Third-party components

The installer includes Electron, React, a trimmed Java runtime, and Java libraries such as ofdrw and Apache PDFBox. Their licenses and copyright notices are provided in `THIRD-PARTY-NOTICES.md`, `licenses/`, and the installed `resources/notices/` directory.

### 6. Children

The application is a general-purpose document tool and does not knowingly collect personal information from anyone, including children.

### 7. Changes

This policy may be updated when application behavior changes. The effective date at the top will be revised.

### 8. Contact

Questions or privacy concerns: open an issue at https://github.com/Zzuser/adouOFD/issues. Do not attach real invoices, contracts, or other sensitive documents to public issues.

## 中文

### 1. 概述

阿豆OFD 是一款免费的离线 Windows 桌面应用，用于读取、搜索、转换和合并 OFD / PDF 文档。应用不要求注册账号，不收集遥测、分析数据、广告标识或文档内容。

### 2. 文档处理

- 文档在本机打开和处理，不上传文档、页面图像、提取文字或派生文件。
- 加密 PDF 的打开密码仅用于在内存中打开文档，不写入磁盘、不写入日志，也不会发送到本地引擎之外的任何位置。
- 本地 Java 引擎仅监听 `127.0.0.1`，每次启动使用随机访问令牌。
- 转换、合并或导出结果只写入用户选择的位置。

### 3. 网络行为

**本程序不会向其他联网系统传输任何信息，除非用户或安装/操作该程序的人明确要求。**

- 阅读、搜索、转换和合并不需要联网。
- 应用不包含账号、云同步、远程日志、遥测、广告或后台/自动更新检查。
- 用户主动点击“关于 → 检查更新”时，应用通过 HTTPS 从 `minio.grout.cn`（测试构建可能为 `testminio.grout.cn`）读取版本清单；请求不包含文档内容、文件路径、账号标识或遥测数据。用户选择下载后，安装包保存到“下载”目录，并按清单中的 SHA256 校验通过后才会提示下载完成。
- 只有用户主动点击外部链接（如 GitHub 仓库、Windows 默认应用设置）时才会打开对应页面。

### 4. 本地数据

应用可能在本机创建：

- `%APPDATA%\adou-ofd` 下的设置、最近文件列表（仅文件路径与显示名称）与本地引擎日志（可能包含文件路径和错误信息）。
- 系统临时目录中的渲染缓存和转换临时文件。
- 用户选择的输出文件。
- 通过“检查更新”下载的安装包，保存在用户的“下载”目录。
- 启用文件关联时，`HKCU\Software\Classes`、`HKCU\Software\RegisteredApplications` 与 `HKCU\Software\AdouOFD` 下的每用户注册表项。

上述数据均保存在本机。最近文件列表可在空状态中清空；日志和设置可手动删除；卸载应用会移除程序文件和文件关联项，`%APPDATA%\adou-ofd` 中的剩余日志可手动清理。

### 5. 第三方组件

安装包包含 Electron、React、精简 Java 运行时，以及 ofdrw、Apache PDFBox 等 Java 库。相关许可与版权声明见 `THIRD-PARTY-NOTICES.md`、`licenses/` 及安装目录的 `resources/notices/`。

### 6. 儿童

本应用是通用文档工具，不主动收集任何人的个人信息，包括儿童。

### 7. 变更

应用行为变化时可能更新本政策，并修改文首生效日期。

### 8. 联系方式

问题或隐私相关事项：https://github.com/Zzuser/adouOFD/issues 。请勿在公开 Issue 中上传真实发票、合同或其他敏感文档。

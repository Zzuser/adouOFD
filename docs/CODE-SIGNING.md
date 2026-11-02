# Code signing policy / 代码签名政策

> **Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).**
>
> **免费代码签名由 [SignPath.io](https://about.signpath.io) 提供，证书由 [SignPath Foundation](https://signpath.org) 签发。**

本文件是 阿豆OFD（ADou OFD）面向公众的代码签名政策，适用于 `https://github.com/Zzuser/adouOFD` 发布的所有 Windows 发行版。任何与本文冲突的历史材料以本文为准。

This is the public code signing policy of 阿豆OFD. It applies to every Windows release published from `https://github.com/Zzuser/adouOFD`.

---

## 中文

### 1. 签名提供方与证书

Windows 发行版的 Authenticode 签名由 **SignPath.io** 提供，代码签名证书签发给 **SignPath Foundation**。因此发行包的发布者（Publisher）显示为 *SignPath Foundation*，这表示该二进制文件由本项目通过公开源码构建、并经 SignPath 验证其来源，不表示 SignPath Foundation 对本软件的认可或担保。

### 2. 签名范围

签名范围严格限定为**由本仓库 GitHub Actions 从公开源码构建的产物**：

| 项目 | 是否签名 | 说明 |
| --- | --- | --- |
| `adou-ofd-<version>-x64-inno.exe`（Inno Setup 安装包） | ✅ 是 | 由 `.github/workflows/release.yml` 在 `windows-latest` 上构建并提交 SignPath 签名 |
| `SHA256-<version>.txt` 校验文件 | ❌ 否 | 纯文本，签名完成后生成 |
| 第三方预编译二进制（ofdrw、Apache PDFBox、Bouncy Castle、Electron、jlink 裁剪的 JRE 等 `.jar` / `.dll` / `.exe`） | ❌ 否 | **不提交签名**，保持上游原貌并随安装包原样分发 |
| 源码、脚本、文档 | ❌ 否 | 非可执行产物 |

即：本项目只为自己从源码构建的安装包使用本项目证书；第三方组件即使被打包进安装包，也不会用本项目证书签名。我们鼓励上游项目自行通过 [SignPath Foundation](https://signpath.org) 或其它方式获得签名。

### 3. 团队角色与成员

本项目为个人维护项目，三类代码签名角色均由仓库所有者担任：

| 角色 | 成员 | 职责 |
| --- | --- | --- |
| **Authors**（作者） | [@Zzuser](https://github.com/Zzuser) | 有权直接修改仓库源码 |
| **Reviewers**（审核者） | [@Zzuser](https://github.com/Zzuser) | 审核非提交者提交的变更（Pull Request），重点关注构建脚本与 CI 配置 |
| **Approvers**（批准者） | [@Zzuser](https://github.com/Zzuser) | 批准每一次签名请求 |

- 所有外部贡献均以 Pull Request 形式提出，合并前必须经 Reviewers 审核。构建脚本、`.github/workflows/`、`scripts/inno/`、依赖清单属于高敏感文件，审核时单独检查。
- 所有项目成员（当前为 1 人）在 GitHub 与 SignPath 账户上均启用多因素认证（MFA / 2FA）。
- 如引入新的常驻维护者，将先在本文件中登记角色后再赋予提交或批准权限。

### 4. 发布与人工批准

**每次发布在签名前都会经过人工批准。** 具体流程：

1. 维护者确认版本号（`desktop/package.json`）并推送 `v<version>` 标签。
2. GitHub Actions 从该标签对应的提交构建安装包，并以构建产物 ID 提交签名请求。
3. **Approvers 在 SignPath 界面逐次人工批准该签名请求**；未经批准不会产生任何签名。
4. SignPath 返回签名后的安装包，工作流校验签名有效性后生成 `SHA256` 并发布 GitHub Release。
5. 签名请求、批准人与构建运行的对应关系保留在 SignPath 与 GitHub Actions 的审计记录中。

### 5. 构建来源与可验证性

- 安装包始终由 **GitHub Actions** 在 **GitHub 托管的 `windows-latest`** 运行器上，从本仓库的公开源码构建；构建过程不依赖维护者本地环境，也不使用预编译的私有产物。
- 签名请求携带该次构建的 GitHub Actions 产物 ID 与运行上下文，由 SignPath 侧执行**来源验证（origin verification）**：签名只对「该仓库该次 CI 构建产出的那个文件」生效，无法为本地手工构建或他人提交的文件签名。
- 依赖版本锁定：`desktop/package-lock.json`（npm）与 Maven 固定版本；第三方二进制通过官方仓库解析，不做本地替换。
- 工作流文件、构建脚本与依赖清单的变更一律通过 Pull Request 审核，避免通过修改 CI 配置注入非源码内容。

### 6. 隐私

本程序不收集、不上传任何用户数据：

> **This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.**
>
> **本程序不会向其他联网系统传输任何信息，除非用户或安装/操作该程序的人明确要求。**

文档处理全部在本机完成；无遥测、无账号、无云端上传。完整说明见 [PRIVACY.md](../PRIVACY.md)。

### 7. 依赖许可

- 应用代码以 **MIT** 许可发布（[LICENSE](../LICENSE)）。
- 全部运行时依赖使用 OSI 批准的开源许可证（MIT / Apache-2.0 / BSD-3-Clause / EPL-2.0 / LGPL-2.1 / LGPL-3.0），**不含商业双授权（commercial dual-licensing）组件，不含 AGPL 组件，不含任何专有或闭源组件**。
- 第三方组件的许可证、版权归属与上游链接见 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) 与 [licenses/](../licenses/)。

### 8. 凭据与密钥

- 仓库中**不包含**任何证书、PFX、私钥、密码或 API Token。
- SignPath API Token 与组织 ID 以 GitHub Actions Secrets 形式保存；项目/策略/产物配置标识以 Repository Variables 形式保存。
- 工作流日志不打印任何凭据。
- 私钥始终由 SignPath 侧持有并用于签名，本项目无法导出或复用。

### 9. 用户如何验证签名

```powershell
# PowerShell
Get-AuthenticodeSignature .\adou-ofd-0.7.1-x64-inno.exe | Format-List Status, StatusMessage, SignerCertificate

# Windows SDK
signtool verify /pa /v adou-ofd-0.7.1-x64-inno.exe
```

签名时间戳由公共 RFC 3161 时间戳服务提供，证书过期后已发布安装包的签名仍然有效。校验和见 Release 页面的 `SHA256-<version>.txt`。

### 10. 违规处理

如发现某次发布不符合本政策（例如被篡改、来源不明），维护者将立即撤下该 Release，向 SignPath Foundation 报告，并配合其完成核查与根因分析。安全问题请按 [SECURITY.md](../SECURITY.md) 私下报告。

---

## English

### 1. Signing provider and certificate

Authenticode signatures for Windows releases are provided by **SignPath.io**; the code signing certificate is issued to **SignPath Foundation**. The publisher shown on releases is therefore *SignPath Foundation*, which confirms that the binary was built from this project's public source code and that its origin was verified — it does not imply endorsement or warranty by SignPath Foundation.

### 2. Scope of signing

| Item | Signed | Notes |
| --- | --- | --- |
| `adou-ofd-<version>-x64-inno.exe` (Inno Setup installer) | ✅ Yes | Built by `.github/workflows/release.yml` on `windows-latest` and submitted to SignPath |
| `SHA256-<version>.txt` | ❌ No | Plain text, generated after signing |
| Third-party prebuilt binaries (ofdrw, Apache PDFBox, Bouncy Castle, Electron, trimmed JRE `.jar` / `.dll` / `.exe`) | ❌ No | Never submitted; shipped unmodified as published upstream |
| Sources, scripts, documentation | ❌ No | Not executable artifacts |

This project signs only the installer it builds from its own source. Third-party binaries bundled inside the installer keep their upstream form and are never signed with this project's certificate. Upstream projects are encouraged to obtain their own signatures through SignPath Foundation or another provider.

### 3. Team roles and members

| Role | Member | Responsibility |
| --- | --- | --- |
| **Authors** | [@Zzuser](https://github.com/Zzuser) | May modify source in the repository directly |
| **Reviewers** | [@Zzuser](https://github.com/Zzuser) | Reviews every change proposed by non-committers (pull requests), with special attention to build scripts and CI configuration |
| **Approvers** | [@Zzuser](https://github.com/Zzuser) | Approves each signing request |

- All outside contributions arrive as pull requests and must be reviewed before merge. Build scripts, `.github/workflows/`, `scripts/inno/` and dependency manifests are treated as high-sensitivity files.
- All team members (currently one) use multi-factor authentication for GitHub and SignPath.
- Any additional maintainer will be recorded here before receiving commit or approval rights.

### 4. Release process and manual approval

**Every release requires manual approval before signing.**

1. The maintainer bumps the version in `desktop/package.json` and pushes a `v<version>` tag.
2. GitHub Actions builds the installer from that commit and submits a signing request referencing the build artifact ID.
3. **An Approver manually approves that specific signing request in SignPath.** Nothing is signed without that approval.
4. SignPath returns the signed installer; the workflow verifies the signature, writes `SHA256`, and publishes the GitHub Release.
5. The link between signing request, approver and CI run is retained in SignPath and GitHub Actions audit records.

### 5. Build origin and verifiability

- Installers are always built by **GitHub Actions** on **GitHub-hosted `windows-latest`** runners from the public source of this repository. No maintainer-local build and no private prebuilt output is ever signed.
- Each signing request carries the GitHub Actions artifact ID and run context, so SignPath performs **origin verification**: a signature can only be produced for the exact artifact built by that repository in that CI run.
- Dependencies are pinned (`desktop/package-lock.json`, fixed Maven versions) and resolved from official registries without local substitution.
- Changes to workflows, build scripts and dependency manifests go through pull request review to prevent non-source content from entering CI.

### 6. Privacy

This program collects and transfers no user data:

> **This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.**

All document processing happens locally; there is no telemetry, account or cloud upload. See [PRIVACY.md](../PRIVACY.md).

### 7. Dependency licensing

- Application code is released under the **MIT** license ([LICENSE](../LICENSE)).
- All runtime dependencies use OSI-approved licenses (MIT / Apache-2.0 / BSD-3-Clause / EPL-2.0 / LGPL-2.1 / LGPL-3.0). There are **no commercially dual-licensed components, no AGPL components and no proprietary or closed-source components**.
- See [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) and [licenses/](../licenses/) for licenses, copyright notices and upstream links.

### 8. Credentials

The repository contains no certificates, PFX files, private keys, passwords or API tokens. The SignPath API token and organization ID live in GitHub Actions secrets; project, policy and artifact-configuration identifiers live in repository variables. The private signing key never leaves SignPath.

### 9. Verifying a release

```powershell
Get-AuthenticodeSignature .\adou-ofd-0.7.1-x64-inno.exe | Format-List Status, StatusMessage, SignerCertificate
signtool verify /pa /v adou-ofd-0.7.1-x64-inno.exe
```

Signatures are RFC 3161 timestamped, so they remain valid after certificate expiry. Checksums are published as `SHA256-<version>.txt` on the release page.

### 10. Policy violations

If a release is found not to comply with this policy, the maintainer will withdraw it, report it to SignPath Foundation, and cooperate with verification and root-cause analysis. Security issues should be reported privately per [SECURITY.md](../SECURITY.md).

---

## 附录 A：流水线配置参考

签名步骤已集成在 `.github/workflows/release.yml`，由仓库变量控制开关。启用签名前需要：

**Secrets**（Settings → Secrets and variables → Actions → Secrets）

| 名称 | 用途 |
| --- | --- |
| `SIGNPATH_API_TOKEN` | SignPath REST API Token |
| `SIGNPATH_ORGANIZATION_ID` | SignPath 组织 ID |

**Variables**（Settings → Secrets and variables → Actions → Variables）

| 名称 | 用途 | 示例 |
| --- | --- | --- |
| `SIGNPATH_ENABLED` | 设为 `true` 才执行签名步骤 | `true` |
| `SIGNPATH_PROJECT_SLUG` | SignPath 项目 slug | `adou-ofd` |
| `SIGNPATH_SIGNING_POLICY_SLUG` | 签名策略 slug（需配置为「需人工批准」） | `release-signing` |
| `SIGNPATH_ARTIFACT_CONFIG_SLUG` | 产物配置 slug | `inno-installer` |

**SignPath 侧需要配置的产物约束**（Artifact Configuration → Metadata restrictions）：

- Product name 固定为本项目名称，Product version 固定为 `<version>`（每次发布一致）。
- 只包含 `adou-ofd-*-x64-inno.exe`，不允许通配其它文件。
- 签名策略必须设置 **Require approval**，由 Approver 逐次批准。

未设置 `SIGNPATH_ENABLED=true` 时，工作流按原有行为发布**未签名**安装包并附带 SHA256，不会失败。

## 附录 B：使用自有证书的替代路径

若后续改用自有 Authenticode 证书（例如 Certum Open Source Code Signing），可绕过 CI 集成，手工对已构建的安装包签名：

```powershell
signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com `
  /f .\adou-signing.pfx /p $env:PFX_PASSWORD `
  .\desktop\dist-inno\adou-ofd-0.7.1-x64-inno.exe
signtool verify /pa /v .\desktop\dist-inno\adou-ofd-0.7.1-x64-inno.exe
```

该方式不提供 CI 来源验证，需在发布说明中注明签名由维护者本地完成。凭据不得提交到仓库。

## 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-11-02 | 由「签名申请材料」改为面向公众的代码签名政策：补充标准署名声明、团队角色、人工批准承诺、签名范围边界与隐私声明 |

# Contributing

## Requirements

- Windows 10/11 x64
- Node.js 24+
- JDK 25 (the repository can install it locally with `node scripts/setup-jdk.mjs`)
- Maven 3.9+
- Inno Setup 6 for installer builds

## Setup

```powershell
cd desktop
npm install
npm run backend:build
npm run dev
```

## Website

The product homepage is a zero-dependency static site in `site/`. Preview it locally:

```powershell
python -m http.server 8080 --directory site
```

Deployment settings and the release checklist are in [docs/SITE.md](docs/SITE.md).

## Checks before a pull request

```powershell
cd backend
$env:JAVA_HOME="F:\adouOFD\.tools\jdk-25"
mvn test

cd ..\desktop
npm run typecheck
npm run build
$env:ADOU_SMOKE_GPU_OFF="1"
npm run smoke:ui
```

All backend tests and the UI smoke test must pass. For UI changes, attach a screenshot or describe the exact window size and interaction path.

## 构建与发布相关文件

以下文件决定发布产物的来源可信度，变更需经维护者审核后再合并：

- `.github/workflows/` —— CI 与发布流水线
- `scripts/` —— 构建、打包与发布前处理
- `desktop/package.json`、`desktop/package-lock.json`、`backend/pom.xml` —— 依赖来源与版本锁定
- `scripts/inno/` —— 安装器定义

请勿在这些文件中引入网络下载的预编译二进制、来源不明的可执行文件，或任何绕过 CI 的发布路径。

## Code guidelines

- Keep document processing local and offline. Do not add telemetry, analytics, accounts, cloud uploads, or automatic network dependencies.
- Preserve the security boundary: renderer has no Node access; all privileged operations go through preload IPC.
- Do not modify source documents. Conversion and merge output must go to a new user-selected path.
- Preserve text-selection fidelity when changing page rendering or text extraction.
- Use functional UI text. Avoid decorative or emotional copy in product surfaces.
- Add tests for parsing, conversion, merge, search, and Windows integration changes where practical.

## Privacy and test data

Never commit real invoices, contracts, identity documents, customer files, access tokens, or private keys. Use generated fixtures from `backend/src/test` or `scripts/stress-fixtures.mjs`.

## License

By contributing, you agree that your contribution is licensed under the project's MIT License (see `LICENSE`). No separate CLA is required.

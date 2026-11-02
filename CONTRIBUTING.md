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

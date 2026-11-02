# Open-Source Code Signing Application

Status: **prepared, not yet submitted**. This document collects the material needed for an open-source Authenticode code-signing application (SignPath Foundation, Certum Open Source Code Signing, or a comparable program). Eligibility and terms are determined by the provider.

## Project

| Item | Value |
| --- | --- |
| Name | 阿豆OFD (ADou OFD) |
| Description | Free, offline Windows desktop reader, search, converter and merger for OFD / PDF documents |
| License | MIT (`LICENSE`) |
| Source | https://github.com/Zzuser/adouOFD (mirror: https://gitcode.com/Zzuser/adouOFD) |
| Releases | https://github.com/Zzuser/adouOFD/releases |
| Privacy policy | https://github.com/Zzuser/adouOFD/blob/main/PRIVACY.md |
| Security policy | https://github.com/Zzuser/adouOFD/blob/main/SECURITY.md |
| Stack | Electron 45 / React 19 / TypeScript / Java 25 / Spring Boot 4 / ofdrw 2.5.1 / PDFBox 3.0.8 |
| Installer | Inno Setup 6, Windows 10/11 x64, per-user, no administrator required |
| Distribution | Free; no paid edition, subscription, ads or telemetry |

## Why signing is requested

Windows SmartScreen shows “Unknown publisher” for unsigned installers. Authenticode signing will let users verify that the installer and executable were produced by this project and were not modified after release. Signing does not imply that the application is endorsed by the certificate provider.

## Eligibility checklist

- [x] OSI-approved license: MIT
- [x] Public source repository (GitHub; GitCode mirror)
- [x] Public privacy policy with no telemetry or document uploads
- [x] Security policy and private vulnerability reporting
- [x] Reproducible build steps and locked dependency versions (`package-lock.json`, Maven)
- [x] CI build workflow for tests and release artifacts
- [x] Release artifact hashes and third-party license notices
- [x] No accounts, ads, paid features or remote document processing
- [ ] Maintainer identity verification by the signing provider
- [ ] Provider account, project and signing policy created

## Build and release artifacts

Release builds are produced by GitHub Actions on `windows-latest`:

1. Install JDK 25 and Node.js 24.
2. `npm ci` in `desktop/`.
3. `npm run backend:build` to produce the Spring Boot fat jar.
4. `npm run package:inno` to build the jlink runtime, Electron app and Inno Setup installer.
5. Publish the installer, `SHA256.txt`, `LICENSE`, `THIRD-PARTY-NOTICES.md`, `PRIVACY.md` and `licenses/`.

Artifact naming: `阿豆OFD-<version>-x64-inno.exe`.

## Signing options

### SignPath Foundation (recommended for OSS)

- Free code signing for eligible open-source projects.
- Signing is performed by SignPath in the release pipeline; the private key is never stored in this repository.
- Application: https://signpath.org/forms/open-source-signing
- After approval, add the SignPath GitHub Action to `.github/workflows/release.yml` and store the API token and organization/project slugs as GitHub Actions secrets.
- Required values to obtain from SignPath: organization ID, project slug, signing policy slug, artifact configuration slug.

### Certum Open Source Code Signing

- Free Authenticode certificate for eligible open-source projects, subject to identity verification.
- Application: https://certum.store/en/open-source-code-signing
- After approval, provide the certificate through the provider’s signing tool or a PFX secret, then sign with `signtool` and timestamp with an RFC 3161 service.

## Application text (English template)

> 阿豆OFD is a free, offline Windows desktop application for reading, searching, converting and merging OFD and PDF documents. The project is licensed under the MIT License and the complete source code is public at https://github.com/Zzuser/adouOFD. The application does not require an account, does not upload documents, and contains no telemetry, analytics, advertising, or paid features. The installer is built from the public source by GitHub Actions with pinned dependency versions and is distributed with SHA256 checksums and third-party license notices. We request an open-source Authenticode certificate so Windows users can verify the publisher and integrity of the installer and executable. The privacy policy is at https://github.com/Zzuser/adouOFD/blob/main/PRIVACY.md and the security policy is at https://github.com/Zzuser/adouOFD/blob/main/SECURITY.md.

## Planned pipeline

1. Push a `v*` tag matching the version in `desktop/package.json`.
2. GitHub Actions builds the installer from the tagged commit.
3. Upload the unsigned installer to the signing provider or sign it with the issued certificate.
4. Verify with `signtool verify /pa /v <installer>`.
5. Publish the signed installer and SHA256 in a GitHub Release.
6. Never commit certificates, PFX files, passwords, API tokens, or private keys.

## Repository secrets

| Secret | Purpose |
| --- | --- |
| `SIGNPATH_API_TOKEN` | SignPath API token (if using SignPath) |
| `SIGNPATH_ORGANIZATION_ID` | SignPath organization ID |
| `WINDOWS_CERT_PFX_BASE64` | Base64-encoded PFX for local Authenticode signing (optional) |
| `WINDOWS_CERT_PASSWORD` | PFX password (optional) |

The current release workflow publishes unsigned artifacts when no signing secret is configured and signs with a PFX when one is provided. SignPath integration should be added after provider approval.

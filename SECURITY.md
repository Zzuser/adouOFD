# Security Policy

## Supported versions

Security fixes are provided for the latest released minor version (currently **0.7.x**).

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could put users at risk.

1. Use GitHub's private vulnerability reporting: https://github.com/Zzuser/adouOFD/security/advisories/new
2. If private reporting is unavailable, open a minimal issue asking for a private contact channel without including exploit details, customer documents, or secrets.

Please include:

- Affected version and Windows version
- A minimal reproduction or proof of concept
- Impact and any known mitigations
- Whether the issue requires a malicious document, local access, or user interaction

Do not attach real invoices, contracts, identity documents, or other personal data. Use synthetic fixtures.

## Scope

In scope:

- The Electron main/preload/renderer boundary and CSP
- Local Java engine API authentication and request handling
- File path handling, temporary files, conversion/merge output paths
- OFD/PDF parsing failures caused by untrusted documents
- Windows registry/file-association handling
- Installer and uninstaller behavior

Out of scope:

- Vulnerabilities in third-party libraries that are already fixed upstream without a practical impact on this project
- Issues requiring a fully compromised local machine
- Social engineering
- Denial of service that only affects the attacker's own local process without persistence or data loss

## Disclosure

We aim to acknowledge reports within 7 days and provide a remediation plan within 30 days. Timelines may vary for issues that depend on upstream projects.

## Safe harbor

Good-faith security research that follows this policy, avoids privacy violations and service disruption, and does not access data beyond what is necessary to demonstrate the issue will not be pursued legally by the project.

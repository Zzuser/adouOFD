# Changelog

## 1.1.3 — 2026-11-04

- Update downloads now accept CNB Release as a source (`cnb.cool` and the `asset.cnb.cool` redirect host), preparing a domestic mirror for a later switch; the production manifest still uses MinIO in this release. No UI or feature changes.
- After publishing a GitHub Release, the release workflow now uploads the same installer, checksum, notes and license files to a CNB Release. CNB hosted nodes are Linux-only, so the Windows installer is still built by GitHub Actions and only distributed by CNB.

## 1.1.2 — 2026-11-04

- File association and desktop shortcut tasks now default to checked for both fresh installs and upgrades; previous task selections are no longer reused (`UsePreviousTasks=no`).
- After an update package downloads and passes SHA256 verification, About now offers “运行安装包” to start the upgrade; the installer can close the running app and install in place. Automation still requires an explicit user click.

## 1.1.1 — 2026-11-04

- Fixed OFD rendering and PDF export for composite objects that omit CTM: content is now translated to its Boundary origin, so 12306 train-ticket invoice seals are horizontally centered instead of being drawn at the page's top-left corner.
- Fixed OFD merges and split/insert operations failing on read-only source files (for example WeChat/WPS cached invoices) by making temporary work copies writable before style/resource repair; write failures now report a readable "read-only or in use" message.
- OFD→PDF conversion no longer aborts when an attachment has a non-ISO date (such as `2026-5-11 11:50:30`); the attachment is skipped with a warning while the document still converts.
- Added a PDF mode selector to merge (Auto / Vector / Image) and an optional `pdfMode` API field. Auto keeps vector output and falls back to 200 DPI images only for pathological files; Vector always keeps selectable text; Image always produces image PDFs. Ordinary invoice merges can use Image to reduce a roughly 92 MB PDF to about 1 MB, and 27 train tickets now merge to a 1.18 MB PDF instead of a multi-hundred-MB file.
- Added a manual update check in About backed by the project MinIO mirror: fetch an HTTPS version manifest, compare versions, download the installer in-app with progress and SHA256 verification, then reveal the verified file. No document data or telemetry is sent, and installation remains user-initiated.
- Added regression coverage for composite placement, read-only merges, non-ISO attachment dates, PDF size fallback and all three PDF modes; backend tests are 68/68 green, and the desktop typecheck/build passes.
- Removed the SignPath code-signing policy and the signing steps from the release workflow: the SignPath Foundation application was declined on 2026-11-03 (the program requires established community visibility). Releases remain **unsigned**; verify installers with the `SHA256-<version>.txt` asset. The license compliance work is unaffected — the non-OSI JSON-java transitive dependency is still excluded, and the private vulnerability reporting channel stays enabled.

## 1.1.0 — 2026-11-03

- Replaced Spring Boot with Javalin 6.7.0 (embedded Jetty 11) and removed Spring, Tomcat, Micrometer, Logback and Jackson 3 from the engine; the service layer is now framework-free and the shaded jar dropped from 48.8 MB to 36.2 MB.
- Engine startup is now about 0.33–0.38s warm and 0.71–0.77s on first run in the development build; the packaged build is about 0.42s warm and 0.97s first run (AppCDS), down from 1.25s / 1.65s.
- The About dialog reports the engine runtime (Javalin 6.7.0) instead of Spring Boot; the health payload field `springBootVersion` was replaced by `runtime`.
- The jlink runtime now ships a base CDS archive and the backend build performs a clean package so stale classes cannot leak into the jar.
- Backend tests are 54/54 green (the Spring context and servlet filter tests were replaced by framework-free token tests); the full Electron UI smoke and a packaged build (open PDF + OFD, About runtime) pass.
- Updated README, PRD, third-party notices and the Apache NOTICE bundle for the Javalin/Jetty/Kotlin/Jackson 2 stack.

## 1.0.0 — 2026-11-03

First stable release: consolidates the 0.10.0 work (page rotation, recent files, document properties, encrypted PDF) with Markdown/text editing, PDF export and the 1.0 home-page refresh.

- Redesigned the OFD/PDF file icons: matching gold folds read as cat ears, a minimal cat face sits above the label, and two paws hold the OFD/PDF label at chest height.
- Added Markdown (`.md` / `.markdown`) and plain-text (`.txt`) viewing and editing: CodeMirror 6 editor with live GFM preview, tables, task lists, fenced-code highlighting, local images, relative links, split/edit/preview modes, a draggable split ratio, heading outline navigation and synchronized scrolling.
- Added encoding-aware text I/O: UTF-8/BOM, UTF-16 LE/BE and GB18030 detection, BOM/CRLF/LF preservation, a 16 MB limit, atomic saves and external-change conflict detection. Text tabs open independently of the Java engine.
- Added Markdown export to A4 PDF from the rendered preview, and “新建 Markdown / 新建文本” actions on the empty state; the OFD/PDF sample buttons were removed and the home copy now covers reading and editing.
- Added `.md` file association (`AdouOFD.MD`, `md-file.ico`), Windows “Open with” and installer registration/cleanup; `.markdown` remains application-only.
- Text files use an `adou-file://` protocol for local images, restricted to image files inside the opened document's directory; remote images are not loaded.
- Added page rotation for OFD/PDF: rotate the current page or all pages by 90° in either direction, reset per page or for the whole document. Rotation is view-level and never modifies the source file; thumbnails, text selection, search positioning, print preview and printed output follow the rotated layout.
- Added a recent-file list on the empty state: up to 20 files are stored locally, deduplicated, pruned when missing, and can be reopened, revealed in Explorer, removed individually or cleared.
- Added a read-only document properties dialog: format, page count, file size, page sizes, PDF/OFD metadata and signature entries. It explicitly does not verify signatures.
- Encrypted PDFs can now be opened with a password. Passwords are used only for the current open and are never stored on disk or written to logs.
- Fixed OFD outline loading for single-document packages, kept the first visible thumbnails eager, and prevented a pending zoom anchor from overriding an explicit page jump.
- Added `ADOU_USER_DATA` for the UI smoke test so automation uses an isolated user-data directory instead of the installed app's profile.
- Added backend and UI smoke coverage for page rotation, rotated text selection/search, rotated print output, recent-file persistence, document properties and the encrypted-PDF password flow.
- Added a dedicated Markdown/text UI smoke (`npm run smoke:text`) covering home-page creation, GFM rendering, local images, GB18030 editing/saving, split resizing, outline navigation, scroll sync, PDF export and unsaved-close handling; updated the main UI smoke to open copied demo documents without home-page sample buttons.

## 0.9.0 — 2026-11-03

- Added a “拆分与插页” tab: split OFD/PDF by every page, every N pages, or custom page ranges; insert pages from another document at the start, before a chosen page, or at the end.
- Mixed-format insertion converts inserted pages to the main document format; split and insert tasks share the heavy-task queue with progress, cancel, page-count verification and atomic output.
- Added page previews with thumbnails, split-group coloring, selected-page dimming and insertion-position markers. Previews use dedicated sessions and do not evict viewer tabs.
- Added backend tests for split/insert and preview sessions, plus real Electron coverage for split/insert previews and output files.
- Updated installer to 0.9.0.

## 0.8.0 — 2026-11-02

- Added an in-app print panel (`Ctrl+P` / “打印”) with live preview: printer selection, copies, grayscale, all/current/custom page ranges, odd/even pages, reverse order, paper size/orientation/margins, N-up (2/4/6/8/9 pages per sheet, row/column order, borders) and duplex.
- Printing now sends the composed sheets directly to the selected printer; OFD and PDF share the same rendering path with adaptive 300/200/150 DPI output.
- Added direct print entries to single-conversion, batch-conversion and merge results, so results can be printed without opening them in the viewer first.
- Added print panel, N-up, paper-size, range, grayscale and result-entry coverage to the UI smoke test.
- Updated installer to 0.8.0.

## 0.7.1 — 2026-11-02

- Unified all tab headers into a 50px single-row layout.
- Moved document tabs into the viewer top bar.
- Compressed the document toolbar to one row; secondary actions become icons on narrow windows.
- Removed decorative/emotional copy from the empty state, About, sidebar, README and PRD.
- Added privacy policy, security policy, contribution and support documents.
- Added GitHub CI/release workflow scaffolding and open-source signing application material.
- Updated installer to 0.7.1.

## 0.7.0 — 2026-11-02

- Added full-text search across OFD/PDF pages with progress, cancel, snippets and page highlighting.
- Added Windows file associations with separate OFD/PDF ProgIDs and file icons.
- Added single-instance file opening from Explorer.
- Split Windows integration into a Settings tab.
- Added open-source notices and full license texts in About and the installer.
- Added Inno Setup installer with an optional file-association task and upgrade handling.
- Added merge, batch conversion and multi-tab viewing to the release line.

## 0.6.0 — 2026-11-02

- Added single-file and batch OFD/PDF conversion.
- Added document merge with mixed-format normalization and resource/style repair.
- Added multi-tab viewing and list “View” actions.
- Added brand UI, jlink runtime packaging and smaller installer.
- Migrated to PDFBox 3.0.8 and ofdrw 2.5.1.

## 0.5.2 — 2025-10

- Initial public desktop reader with OFD/PDF preview, text selection, outline and thumbnails.

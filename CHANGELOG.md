# Changelog

## Unreleased — 0.10.0

- Added page rotation for OFD/PDF: rotate the current page or all pages by 90° in either direction, reset per page or for the whole document. Rotation is view-level and never modifies the source file; thumbnails, text selection, search positioning, print preview and printed output follow the rotated layout.
- Added a recent-file list on the empty state: up to 20 files are stored locally, deduplicated, pruned when missing, and can be reopened, revealed in Explorer, removed individually or cleared.
- Added a read-only document properties dialog: format, page count, file size, page sizes, PDF/OFD metadata and signature entries. It explicitly does not verify signatures.
- Encrypted PDFs can now be opened with a password. Passwords are used only for the current open and are never stored on disk or written to logs.
- Fixed OFD outline loading for single-document packages, kept the first visible thumbnails eager, and prevented a pending zoom anchor from overriding an explicit page jump.
- Added `ADOU_USER_DATA` for the UI smoke test so automation uses an isolated user-data directory instead of the installed app's profile.
- Added backend and UI smoke coverage for page rotation, rotated text selection/search, rotated print output, recent-file persistence, document properties and the encrypted-PDF password flow.

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

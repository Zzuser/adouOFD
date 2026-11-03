# Changelog

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

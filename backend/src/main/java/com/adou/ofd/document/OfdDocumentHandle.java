package com.adou.ofd.document;

import org.ofdrw.converter.ImageMaker;
import org.ofdrw.core.action.CT_Action;
import org.ofdrw.core.action.Actions;
import org.ofdrw.core.action.actionType.OFDAction;
import org.ofdrw.core.action.actionType.actionGoto.CT_Dest;
import org.ofdrw.core.action.actionType.actionGoto.Goto;
import org.ofdrw.core.action.actionType.actionGoto.OFDGotoTarget;
import org.ofdrw.core.basicStructure.doc.Document;
import org.ofdrw.core.basicStructure.doc.bookmark.Bookmark;
import org.ofdrw.core.basicStructure.doc.bookmark.Bookmarks;
import org.ofdrw.core.basicStructure.outlines.CT_OutlineElem;
import org.ofdrw.core.basicStructure.outlines.Outlines;
import org.ofdrw.core.basicType.ST_Box;
import org.ofdrw.core.basicType.ST_ID;
import org.ofdrw.core.basicType.ST_RefID;
import org.ofdrw.core.basicStructure.pageObj.layer.block.TextObject;
import org.ofdrw.reader.ContentExtractor;
import org.ofdrw.reader.OFDReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 持有打开的 OFDReader 与按 DPI 缓存的 ImageMaker，避免每页重复解析 OFD 包。
 */
public final class OfdDocumentHandle implements DocumentHandle {

    private static final Logger log = LoggerFactory.getLogger(OfdDocumentHandle.class);
    private static final int MAX_OUTLINE_ITEMS = 5_000;
    private static final int MAX_OUTLINE_DEPTH = 20;
    private static final int MAX_TEXT_RUNS = 20_000;
    private static final int MAX_RENDER_SIDE_PX = 12_000;

    private final OFDReader reader;
    private final Path workDir;
    private final List<PageMeta> pages;
    private final boolean signed;
    private final Map<Long, Integer> pageIds = new HashMap<>();
    private final Map<Integer, ImageMaker> imageMakers = new HashMap<>();
    private final Map<Integer, List<TextRun>> textCache = new HashMap<>();
    private ContentExtractor textExtractor;
    private List<OutlineItem> outlineCache;

    private OfdDocumentHandle(OFDReader reader, Path workDir) throws IOException {
        this.reader = reader;
        this.workDir = workDir;
        int pageCount = reader.getNumberOfPages();
        if (pageCount <= 0) {
            throw new IOException("OFD 不包含任何页面");
        }
        List<PageMeta> pageList = new ArrayList<>(pageCount);
        for (int index = 0; index < pageCount; index++) {
            double width = 0;
            double height = 0;
            try {
                ST_Box box = reader.getPageSize(index + 1);
                if (box != null) {
                    width = box.getWidth() == null ? 0 : box.getWidth();
                    height = box.getHeight() == null ? 0 : box.getHeight();
                }
            } catch (RuntimeException ex) {
                log.warn("读取 OFD 第 {} 页尺寸失败: {}", index + 1, ex.getMessage());
            }
            pageList.add(new PageMeta(index + 1, round(width), round(height)));
            try {
                ST_ID pageId = reader.getPageObjectId(index + 1);
                if (pageId != null && pageId.getId() != null) {
                    pageIds.put(pageId.getId(), index + 1);
                }
            } catch (RuntimeException ex) {
                log.debug("读取 OFD 第 {} 页对象 ID 失败", index + 1);
            }
        }
        this.pages = List.copyOf(pageList);
        this.signed = reader.hasSignature();
    }

    public static OfdDocumentHandle open(Path path, Path workDir) throws IOException {
        OFDReader.setZipFileMaxSize(512L * 1024 * 1024);
        OFDReader reader = null;
        try {
            reader = new OFDReader(path);
            return new OfdDocumentHandle(reader, workDir);
        } catch (IOException | RuntimeException ex) {
            if (reader != null) {
                try {
                    reader.close();
                } catch (IOException ignored) {
                    // 保留原始异常
                }
            }
            throw ex;
        }
    }

    @Override
    public List<PageMeta> pages() {
        return pages;
    }

    @Override
    public int pageCount() {
        return pages.size();
    }

    @Override
    public boolean signed() {
        return signed;
    }

    @Override
    public synchronized List<OutlineItem> outline() {
        if (outlineCache != null) {
            return outlineCache;
        }
        List<OutlineItem> items = new ArrayList<>();
        try {
            Document document = reader.getDoc(1);
            if (document != null) {
                Map<String, Integer> bookmarkPages = new HashMap<>();
                Bookmarks bookmarks = document.getBookmarks();
                if (bookmarks != null && bookmarks.getBookmarks() != null) {
                    for (Bookmark bookmark : bookmarks.getBookmarks()) {
                        String name = bookmark.getBookmarkName();
                        Integer page = pageFromDest(bookmark.getDest());
                        if (name != null && page != null) {
                            bookmarkPages.put(name, page);
                        }
                    }
                }

                Outlines outlines = document.getOutlines();
                if (outlines != null && outlines.getOutlineElems() != null
                        && !outlines.getOutlineElems().isEmpty()) {
                    collectOutline(outlines.getOutlineElems(), 1, items, bookmarkPages);
                } else if (bookmarks != null && bookmarks.getBookmarks() != null) {
                    for (Bookmark bookmark : bookmarks.getBookmarks()) {
                        String title = bookmark.getBookmarkName();
                        if (title != null && !title.isBlank()) {
                            items.add(new OutlineItem(title.trim(), pageFromDest(bookmark.getDest()), 1));
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("读取 OFD 目录失败: {}", ex.getMessage());
        }
        outlineCache = List.copyOf(items);
        return outlineCache;
    }

    @Override
    public synchronized List<TextRun> pageText(int page) throws IOException {
        if (page < 1 || page > pages.size()) {
            throw new IOException("页码超出范围");
        }
        List<TextRun> cached = textCache.get(page);
        if (cached != null) {
            return cached;
        }
        PageMeta meta = pages.get(page - 1);
        double pageWidth = meta.widthMm() > 0 ? meta.widthMm() : 210;
        double pageHeight = meta.heightMm() > 0 ? meta.heightMm() : 297;

        List<TextRun> runs = new ArrayList<>();
        double[] lastBaseline = {Double.NaN};
        double[] lastFontSize = {0};
        try {
            if (textExtractor == null) {
                textExtractor = new ContentExtractor(reader);
            }
            List<TextObject> objects = textExtractor.getPageTextObject(page);
            if (objects != null) {
                outer:
                for (TextObject object : objects) {
                    ST_Box box = object.getBoundary();
                    if (box == null || box.getWidth() == null || box.getHeight() == null) {
                        continue;
                    }
                    double originX = box.getTopLeftX() == null ? 0 : box.getTopLeftX();
                    double originY = box.getTopLeftY() == null ? 0 : box.getTopLeftY();
                    double fontSize = object.getSize() != null && object.getSize() > 0
                            ? object.getSize() : box.getHeight();
                    if (object.getTextCodes() == null) {
                        continue;
                    }
                    for (var code : object.getTextCodes()) {
                        if (code == null || code.getContent() == null || code.getContent().isEmpty()) {
                            continue;
                        }
                        String content = code.getContent();
                        int[] codePoints = content.codePoints().toArray();
                        Double[] deltas = null;
                        if (code.getDeltaX() != null) {
                            try {
                                deltas = code.getDeltaX().toDouble();
                            } catch (RuntimeException ignored) {
                                deltas = null;
                            }
                        }
                        double codeX = code.getX() == null ? 0 : code.getX();
                        double baselineOffset = code.getY() == null ? fontSize : code.getY();
                        double baseline = originY + baselineOffset;
                        double fallbackWidth = codePoints.length > 0
                                ? Math.max(0.4, box.getWidth() / codePoints.length) : fontSize * 0.6;
                        double cursor = originX + codeX;
                        for (int index = 0; index < codePoints.length; index++) {
                            if (runs.size() >= MAX_TEXT_RUNS) {
                                break outer;
                            }
                            if (!Double.isNaN(lastBaseline[0])
                                    && Math.abs(baseline - lastBaseline[0])
                                    > Math.max(lastFontSize[0], fontSize) * 0.6) {
                                appendNewline(runs);
                            }
                            lastBaseline[0] = baseline;
                            lastFontSize[0] = fontSize;
                            String character = new String(Character.toChars(codePoints[index]));
                            double glyphWidth = (deltas != null && index < deltas.length
                                    && deltas[index] != null && deltas[index] > 0)
                                    ? deltas[index] : fallbackWidth;
                            runs.add(new TextRun(
                                    character,
                                    clamp01(cursor / pageWidth),
                                    clamp01((originY + baselineOffset - fontSize) / pageHeight),
                                    clamp01(glyphWidth / pageWidth),
                                    clamp01((fontSize * 1.1) / pageHeight),
                                    clamp01(fontSize / pageHeight)));
                            cursor += glyphWidth;
                        }
                    }
                }
            }
        } catch (RuntimeException ex) {
            throw new IOException("OFD 文本提取失败: " + ex.getMessage(), ex);
        }
        List<TextRun> result = List.copyOf(runs);
        textCache.put(page, result);
        return result;
    }

    @Override
    public synchronized Path render(int page, int dpi) throws IOException {
        if (page < 1 || page > pages.size()) {
            throw new IOException("页码超出范围");
        }
        int actualDpi = cappedDpi(page, dpi);
        Path outputDir = workDir.resolve("render").resolve("ofd-p" + page + "-" + actualDpi);
        Path png = outputDir.resolve("page.png");
        if (Files.isRegularFile(png) && Files.size(png) > 0) {
            return png;
        }
        Files.createDirectories(outputDir);
        ImageMaker maker = imageMakers.computeIfAbsent(actualDpi, value -> {
            ImageMaker imageMaker = new ImageMaker(reader, value / 25.4);
            imageMaker.config.setDrawBoundary(false);
            return imageMaker;
        });
        BufferedImage image = maker.makePage(page - 1);
        if (image == null) {
            throw new IOException("OFD 页面渲染结果为空");
        }
        if (!ImageIO.write(image, "PNG", png.toFile())) {
            throw new IOException("OFD 页面 PNG 编码失败");
        }
        return png;
    }

    @Override
    public synchronized void close() throws IOException {
        reader.close();
    }

    private void collectOutline(List<CT_OutlineElem> elements, int level, List<OutlineItem> items,
                                Map<String, Integer> bookmarkPages) {
        if (level > MAX_OUTLINE_DEPTH || items.size() >= MAX_OUTLINE_ITEMS) {
            return;
        }
        for (CT_OutlineElem element : elements) {
            if (items.size() >= MAX_OUTLINE_ITEMS) {
                return;
            }
            String title = element.getTitle();
            Integer page = pageFromActions(element.getActions(), bookmarkPages);
            if (title != null && !title.isBlank()) {
                items.add(new OutlineItem(title.trim(), page, level));
            }
            List<CT_OutlineElem> children = element.getOutlineElems();
            if (children != null && !children.isEmpty()) {
                collectOutline(children, level + 1, items, bookmarkPages);
            }
        }
    }

    private Integer pageFromActions(Actions actions, Map<String, Integer> bookmarkPages) {
        if (actions == null || actions.getActions() == null) {
            return null;
        }
        for (CT_Action action : actions.getActions()) {
            OFDAction targetAction = action.getAction();
            if (targetAction instanceof Goto gotoAction) {
                OFDGotoTarget target = gotoAction.getTarget();
                if (target instanceof CT_Dest dest) {
                    return pageFromDest(dest);
                }
                if (target instanceof org.ofdrw.core.action.actionType.actionGoto.Bookmark bookmarkTarget) {
                    return bookmarkPages.get(bookmarkTarget.getBookmarkName());
                }
            }
        }
        return null;
    }

    private Integer pageFromDest(CT_Dest dest) {
        if (dest == null) {
            return null;
        }
        ST_RefID reference = dest.getPageID();
        if (reference == null || reference.getRefId() == null) {
            return null;
        }
        return pageIds.get(reference.getRefId().getId());
    }

    private int cappedDpi(int page, int dpi) {
        PageMeta meta = pages.get(page - 1);
        double maxSideMm = Math.max(meta.widthMm(), meta.heightMm());
        if (maxSideMm <= 0) {
            return dpi;
        }
        double limit = MAX_RENDER_SIDE_PX / (maxSideMm / 25.4);
        return (int) Math.max(24, Math.min(dpi, Math.floor(limit)));
    }

    private static double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static void appendNewline(List<TextRun> runs) {
        if (runs.isEmpty()) {
            return;
        }
        TextRun last = runs.getLast();
        if (!last.text().endsWith("\n")) {
            runs.set(runs.size() - 1, new TextRun(
                    last.text() + "\n",
                    last.x(), last.y(), last.width(), last.height(), last.fontSize()));
        }
    }

    private static double clamp01(double value) {
        return Math.max(0, Math.min(1, value));
    }
}

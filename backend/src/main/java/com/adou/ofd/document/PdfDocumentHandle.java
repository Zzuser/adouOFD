package com.adou.ofd.document;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

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
 * 持有打开的 PDF 文档，避免翻页/缩放时反复解析。
 * 所有渲染由 DocumentService 串行调用，且方法本身加锁，保证 PDFBox 非线程安全对象不被并发访问。
 */
public final class PdfDocumentHandle implements DocumentHandle {

    private static final double PT_TO_MM = 25.4 / 72.0;
    private static final int MAX_RENDER_SIDE_PX = 12_000;
    private static final int MAX_OUTLINE_ITEMS = 5_000;
    private static final int MAX_OUTLINE_DEPTH = 20;

    private final PDDocument document;
    private final PDFRenderer renderer;
    private final List<PageMeta> pages;
    private final boolean signed;
    private final Path workDir;
    private List<OutlineItem> outlineCache;
    private final Map<Integer, List<TextRun>> textCache = new HashMap<>();

    private PdfDocumentHandle(PDDocument document, Path workDir) throws IOException {
        this.document = document;
        this.workDir = workDir;
        if (document.getNumberOfPages() <= 0) {
            throw new IOException("PDF 不包含任何页面");
        }
        this.renderer = new PDFRenderer(document);
        this.renderer.setSubsamplingAllowed(true);

        List<PageMeta> pageList = new ArrayList<>(document.getNumberOfPages());
        for (int index = 0; index < document.getNumberOfPages(); index++) {
            PDPage page = document.getPage(index);
            PDRectangle box = effectiveBox(page);
            double width = box == null ? 0 : box.getWidth();
            double height = box == null ? 0 : box.getHeight();
            int rotation = ((page.getRotation() % 360) + 360) % 360;
            if (rotation == 90 || rotation == 270) {
                double swap = width;
                width = height;
                height = swap;
            }
            pageList.add(new PageMeta(index + 1, round(width * PT_TO_MM), round(height * PT_TO_MM)));
        }
        this.pages = List.copyOf(pageList);

        boolean hasSignature;
        try {
            hasSignature = !document.getSignatureDictionaries().isEmpty();
        } catch (RuntimeException ex) {
            // PDFBox 3 解析签名失败时不抛 IOException
            hasSignature = false;
        }
        this.signed = hasSignature;
    }

    public static PdfDocumentHandle open(Path path, Path workDir) throws IOException {
        Path scratchDir = workDir.resolve("pdf-scratch");
        Files.createDirectories(scratchDir);
        MemoryUsageSetting memory = MemoryUsageSetting.setupMixed(128L * 1024 * 1024)
                .setTempDir(scratchDir.toFile());
        PDDocument document = null;
        try {
            // PDFBox 3 用 StreamCacheCreateFunction 代替 MemoryUsageSetting 参数
            document = Loader.loadPDF(path.toFile(), memory.streamCache);
            return new PdfDocumentHandle(document, workDir);
        } catch (IOException | RuntimeException ex) {
            if (document != null) {
                try {
                    document.close();
                } catch (IOException ignored) {
                    // 保留原始异常
                }
            }
            throw ex;
        }
    }

    public List<PageMeta> pages() {
        return pages;
    }

    public int pageCount() {
        return pages.size();
    }

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
            PDDocumentOutline root = document.getDocumentCatalog().getDocumentOutline();
            if (root != null) {
                collectOutline(root, 1, items);
            }
        } catch (RuntimeException ex) {
            // 目录损坏不影响文档预览
        }
        outlineCache = List.copyOf(items);
        return outlineCache;
    }

    private void collectOutline(PDOutlineNode node, int level, List<OutlineItem> items) {
        if (level > MAX_OUTLINE_DEPTH || items.size() >= MAX_OUTLINE_ITEMS) {
            return;
        }
        PDOutlineItem child = node.getFirstChild();
        while (child != null && items.size() < MAX_OUTLINE_ITEMS) {
            String title = child.getTitle();
            Integer page = null;
            try {
                PDPage target = child.findDestinationPage(document);
                if (target != null) {
                    int index = document.getPages().indexOf(target);
                    if (index >= 0) {
                        page = index + 1;
                    }
                }
            } catch (IOException | RuntimeException ignored) {
                // 目标页无法解析时仅展示标题
            }
            if (title != null && !title.isBlank()) {
                items.add(new OutlineItem(title.trim(), page, level));
            }
            collectOutline(child, level + 1, items);
            child = child.getNextSibling();
        }
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

        List<TextRun> runs = new ArrayList<>();
        int rotation = normalizeRotation(document.getPage(page - 1).getRotation());
        float[] lastBaseline = {Float.NaN};
        float[] lastHeight = {0};
        PDFTextStripper stripper = new PDFTextStripper() {
            @Override
            protected void writeString(String text, List<TextPosition> positions) {
                if (positions == null || positions.isEmpty()) {
                    return;
                }
                float pageWidth = positions.getFirst().getPageWidth();
                float pageHeight = positions.getFirst().getPageHeight();
                if (pageWidth <= 0 || pageHeight <= 0) {
                    return;
                }
                float previousEndX = Float.NaN;
                boolean previousSpace = false;
                for (TextPosition position : positions) {
                    String unicode = position.getUnicode();
                    if (unicode == null || unicode.isEmpty()) {
                        continue;
                    }
                    float x = position.getXDirAdj();
                    float width = position.getWidthDirAdj();
                    float baselineY = position.getYDirAdj();
                    float height = position.getHeightDir();
                    float fontPt = position.getFontSizeInPt();
                    if (height <= 0) {
                        height = fontPt > 0 ? fontPt : 1;
                    }
                    if (width <= 0) {
                        width = Math.max(1, height * 0.2f);
                    }
                    boolean space = unicode.codePoints().allMatch(Character::isWhitespace);

                    boolean newLine = !Float.isNaN(lastBaseline[0])
                            && Math.abs(baselineY - lastBaseline[0])
                            > Math.max(lastHeight[0], height) * 0.6f;
                    if (newLine) {
                        appendNewline(runs);
                        previousEndX = Float.NaN;
                        previousSpace = false;
                    }
                    lastBaseline[0] = baselineY;
                    lastHeight[0] = height;

                    if (!newLine && !space && !Float.isNaN(previousEndX) && !previousSpace) {
                        float gap = x - previousEndX;
                        if (gap > Math.max(1.2f, height * 0.2f)) {
                            runs.add(toTextRun(" ", previousEndX, baselineY, gap, height,
                                    fontPt, pageWidth, pageHeight, rotation));
                        }
                    }

                    runs.add(toTextRun(unicode, x, baselineY, width, height, fontPt,
                            pageWidth, pageHeight, rotation));
                    previousEndX = x + width;
                    previousSpace = space;
                }
            }
        };
        stripper.setSortByPosition(true);
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        stripper.getText(document);
        List<TextRun> result = List.copyOf(runs);
        textCache.put(page, result);
        return result;
    }

    private static TextRun toTextRun(String text, float x, float baselineY, float width, float height,
                                     float fontPt, float pageWidth, float pageHeight, int rotation) {
        double displayWidth = (rotation == 90 || rotation == 270) ? pageHeight : pageWidth;
        double displayHeight = (rotation == 90 || rotation == 270) ? pageWidth : pageHeight;
        double left;
        double top;
        double boxWidth;
        double boxHeight;
        switch (rotation) {
            case 90 -> {
                left = pageHeight - baselineY;
                top = x;
                boxWidth = height;
                boxHeight = width;
            }
            case 180 -> {
                left = pageWidth - (x + width);
                top = pageHeight - baselineY;
                boxWidth = width;
                boxHeight = height;
            }
            case 270 -> {
                left = baselineY - height;
                top = pageWidth - (x + width);
                boxWidth = height;
                boxHeight = width;
            }
            default -> {
                left = x;
                top = baselineY - height;
                boxWidth = width;
                boxHeight = height;
            }
        }
        return new TextRun(
                text,
                clamp01(left / displayWidth),
                clamp01(top / displayHeight),
                clamp01(boxWidth / displayWidth),
                clamp01(boxHeight / displayHeight),
                clamp01(fontPt / displayHeight));
    }

    @Override
    public synchronized Path render(int page, int dpi) throws IOException {
        if (page < 1 || page > pages.size()) {
            throw new IOException("页码超出范围");
        }
        int actualDpi = cappedDpi(page, dpi);
        Path outputDir = workDir.resolve("render").resolve("pdf-p" + page + "-" + actualDpi);
        Path png = outputDir.resolve("page.png");
        if (Files.isRegularFile(png) && Files.size(png) > 0) {
            return png;
        }
        Files.createDirectories(outputDir);
        BufferedImage image = renderer.renderImageWithDPI(page - 1, actualDpi, ImageType.RGB);
        if (image == null) {
            throw new IOException("PDF 页面渲染结果为空");
        }
        if (!ImageIO.write(image, "PNG", png.toFile())) {
            throw new IOException("PDF 页面 PNG 编码失败");
        }
        return png;
    }

    @Override
    public synchronized void close() throws IOException {
        document.close();
    }

    private int cappedDpi(int page, int dpi) {
        PDPage pdfPage = document.getPage(page - 1);
        PDRectangle box = effectiveBox(pdfPage);
        double maxSide = box == null ? 0 : Math.max(box.getWidth(), box.getHeight());
        if (maxSide <= 0) {
            return dpi;
        }
        double limit = 72.0 * MAX_RENDER_SIDE_PX / maxSide;
        return (int) Math.max(24, Math.min(dpi, Math.floor(limit)));
    }

    private static PDRectangle effectiveBox(PDPage page) {
        PDRectangle box = page.getCropBox();
        if (box == null || box.getWidth() <= 0 || box.getHeight() <= 0) {
            box = page.getMediaBox();
        }
        return box;
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

    private static int normalizeRotation(int rotation) {
        return ((rotation % 360) + 360) % 360;
    }
}

package com.adou.ofd.convert;

import com.adou.ofd.web.ApiException;
import org.apache.fontbox.ttf.TTFParser;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.multipdf.Splitter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.ofdrw.converter.FontLoader;
import org.ofdrw.converter.ImageMaker;
import org.ofdrw.converter.PdfboxMaker;
import org.ofdrw.converter.ofdconverter.DocConverter;
import org.ofdrw.converter.ofdconverter.PDFGraphicsConverter;
import org.ofdrw.converter.ofdconverter.PDFConverter;
import org.ofdrw.core.basicStructure.pageObj.layer.block.TextObject;
import org.ofdrw.core.basicType.ST_Box;
import org.ofdrw.core.text.TextCode;
import org.ofdrw.reader.ContentExtractor;
import org.ofdrw.reader.OFDReader;
import org.ofdrw.reader.PageInfo;
import org.ofdrw.tool.merge.OFDMerger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.adou.ofd.web.Http;

import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * OFD ↔ PDF 转换实现与输出质量校验。
 *
 * <p>OFD → PDF 使用 ofdrw 的 PDFBox 实现（不引入 iText），逐页调用
 * {@link PdfboxMaker#makePage} 以便上报进度并支持中途取消；
 * PDF → OFD 使用 {@link PDFConverter}，按批次转换以获得页级进度。
 */
public class ConversionEngine {

    private static final Logger log = LoggerFactory.getLogger(ConversionEngine.class);
    private static final int PROGRESS_START = 5;
    private static final int PROGRESS_SPAN = 85;
    private static final int MAX_REPORTED_FONTS = 5;
    private static final double MM_TO_PT = 72.0 / 25.4;
    private static final int IMAGE_FALLBACK_DPI = 150;
    private static final int MAX_SAMPLE_CHARS = 20_000;
    /**
     * 分片策略（依据 2026-11-02 实测，2GB 堆）：
     * <ul>
     *   <li>单次转换峰值约 12MB/页，超过堆 75% 就会 GC 抖动甚至 OOM；</li>
     *   <li>合并耗时只与总页数相关（约 75ms/页），与分片数量几乎无关；</li>
     *   <li>每片内存约 12MB/页，片越小并行度越高、峰值越低。</li>
     * </ul>
     */
    private static final long HEAP_MB_PER_PAGE_SINGLE = 12L;
    private static final long HEAP_MB_PER_PAGE_SHARD = 12L;
    private static final int SINGLE_PASS_HEAP_PERCENT = 75;
    private static final int SHARD_MIN_PAGES = 20;
    private static final int SHARD_MAX_PAGES = 60;
    private static final int SHARD_TARGET_COUNT = 10;
    private static final int MAX_SHARD_WORKERS = 4;
    private static final long MB_PER_WORKER = 900;
    private static final AtomicBoolean FONT_ALIASES_READY = new AtomicBoolean();
    private static final Locale[] ALIAS_LOCALES = {Locale.CHINA, Locale.ENGLISH, Locale.TRADITIONAL_CHINESE};

    /** 导出模式：矢量（保留文字）或图像（保真但不可选中）。 */
    public enum ExportMode {
        VECTOR,
        IMAGE
    }

    /** 转换进度回调；{@link #canceled()} 返回 true 时引擎应尽快停止。 */
    public interface Progress {
        void update(int percent, String phase);

        boolean canceled();
    }

    public record SourceInfo(String kind, int pages) {
    }

    /**
     * 轻量探测源文件类型与页数，不建立阅读会话。
     */
    public SourceInfo probe(Path path) throws IOException {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".pdf")) {
            try (PDDocument document = Loader.loadPDF(path.toFile())) {
                return new SourceInfo("PDF", document.getNumberOfPages());
            }
        }
        if (name.endsWith(".ofd")) {
            try (OFDReader reader = new OFDReader(path)) {
                return new SourceInfo("OFD", reader.getNumberOfPages());
            }
        }
        throw new ApiException(Http.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FORMAT",
                "仅支持转换 .ofd 与 .pdf 文件");
    }

    public ExportMode ofdToPdf(Path source, Path output, Progress progress) throws IOException {
        ensureFontAliases();
        long vectorStarted = System.nanoTime();
        exportOfdToPdfVector(source, output, progress);
        long vectorMs = (System.nanoTime() - vectorStarted) / 1_000_000;
        if (!dropsChineseText(source, output)) {
            log.info("OFD→PDF 矢量导出完成: {} ms", vectorMs);
            return ExportMode.VECTOR;
        }
        // 源 OFD 未内嵌字体且系统无法匹配时，PdfboxMaker 会退回 Helvetica，中文被静默丢弃。
        // 此时改用本机渲染结果按图像写入 PDF，保证版面与原文件一致。
        log.info("OFD→PDF 字体保真失败（矢量 {} ms），改用图像导出: {}", vectorMs, source.getFileName());
        progress.update(PROGRESS_START + PROGRESS_SPAN, "字体无法嵌入，正在按图像重新导出");
        Files.deleteIfExists(output);
        long imageStarted = System.nanoTime();
        exportOfdToPdfImage(source, output, progress);
        log.info("OFD→PDF 图像导出完成: {} ms", (System.nanoTime() - imageStarted) / 1_000_000);
        return ExportMode.IMAGE;
    }

    /**
     * ofdrw 在 TTC 字体集合里只认 PS 名（如 MicrosoftYaHei），中文族名（微软雅黑）查不到字形，
     * 会导致 PDFBox 导出静默退回 Helvetica、中文全部丢失。这里把系统字体族名映射到 PS 名。
     */
    private void ensureFontAliases() {
        if (!FONT_ALIASES_READY.compareAndSet(false, true)) {
            return;
        }
        try {
            FontLoader loader = FontLoader.getInstance();
            String[] families = GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames();
            int registered = 0;
            for (String family : families) {
                try {
                    Font font = new Font(family, Font.PLAIN, 12);
                    String psName = font.getPSName();
                    if (psName == null || psName.isBlank() || "Dialog".equals(psName)) {
                        continue;
                    }
                    registered += registerAlias(loader, family, psName);
                    // JVM 语言环境不同会拿到英文族名，OFD 里常见中文族名，两种都要注册
                    for (Locale locale : ALIAS_LOCALES) {
                        registered += registerAlias(loader, font.getFamily(locale), psName);
                        registered += registerAlias(loader, font.getFontName(locale), psName);
                    }
                } catch (RuntimeException ex) {
                    log.debug("注册字体别名失败: {}", family, ex);
                }
            }
            log.info("已注册 {} 个字体别名（{} 个字体族）", registered, families.length);
        } catch (RuntimeException ex) {
            log.warn("注册字体别名失败，OFD→PDF 可能退回图像导出", ex);
        }
    }

    private int registerAlias(FontLoader loader, String name, String psName) {
        if (name == null || name.isBlank() || name.equals(psName)) {
            return 0;
        }
        loader.addAliasMapping(name, psName);
        return 1;
    }

    private void exportOfdToPdfVector(Path source, Path output, Progress progress) throws IOException {
        try (OFDReader reader = new OFDReader(source);
             PDDocument document = new PDDocument()) {
            PdfboxMaker maker = new PdfboxMaker(reader, document);
            // ofdrw 的页码接口是 1 起的，这里统一用页面列表避免索引换算
            List<PageInfo> pages = reader.getPageList();
            int total = pages.size();
            if (total <= 0) {
                throw new IOException("源文档不包含任何页面");
            }
            for (int index = 0; index < total; index++) {
                checkCanceled(progress);
                maker.makePage(pages.get(index));
                report(progress, index + 1, total, "正在转换第 ");
            }
            progress.update(PROGRESS_START + PROGRESS_SPAN, "正在写入 PDF 文件");
            maker.addAttachments(reader);
            document.save(output.toFile());
        }
    }

    /**
     * 用本机渲染结果生成 PDF：版面 100% 一致，但文字不可选中。
     */
    private void exportOfdToPdfImage(Path source, Path output, Progress progress) throws IOException {
        try (OFDReader reader = new OFDReader(source);
             PDDocument document = new PDDocument()) {
            List<PageInfo> pages = reader.getPageList();
            int total = pages.size();
            if (total <= 0) {
                throw new IOException("源文档不包含任何页面");
            }
            ImageMaker maker = new ImageMaker(reader, IMAGE_FALLBACK_DPI / 25.4);
            for (int index = 0; index < total; index++) {
                checkCanceled(progress);
                ST_Box box = pages.get(index).getSize();
                float width = (float) (box.getWidth() * MM_TO_PT);
                float height = (float) (box.getHeight() * MM_TO_PT);
                PDPage page = new PDPage(new PDRectangle(width, height));
                document.addPage(page);
                BufferedImage image = maker.makePage(index);
                if (image == null) {
                    throw new IOException("第 " + (index + 1) + " 页渲染失败");
                }
                PDImageXObject xObject = LosslessFactory.createFromImage(document, image);
                try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                    stream.drawImage(xObject, 0, 0, width, height);
                }
                report(progress, index + 1, total, "正在按图像导出第 ");
            }
            document.save(output.toFile());
        }
    }

    /**
     * 判断矢量导出的 PDF 是否丢失了中文：源文档中文很多、输出中文极少即视为字体嵌入失败。
     */
    private boolean dropsChineseText(Path sourceOfd, Path outputPdf) {
        try {
            int sourceCjk = countCjk(sampleOfdText(sourceOfd));
            if (sourceCjk < 20) {
                return false;
            }
            int outputCjk = countCjk(samplePdfText(outputPdf));
            log.info("字体保真检查: 源中文 {} 字，PDF 中文 {} 字", sourceCjk, outputCjk);
            return outputCjk * 3 < sourceCjk;
        } catch (IOException | RuntimeException ex) {
            log.warn("字体保真检查失败，保留矢量导出", ex);
            return false;
        }
    }

    private String sampleOfdText(Path path) throws IOException {
        StringBuilder builder = new StringBuilder();
        try (OFDReader reader = new OFDReader(path)) {
            ContentExtractor extractor = new ContentExtractor(reader);
            for (int page : samplePages(reader.getNumberOfPages())) {
                List<TextObject> objects = extractor.getPageTextObject(page);
                if (objects == null) {
                    continue;
                }
                for (TextObject object : objects) {
                    List<TextCode> codes = object.getTextCodes();
                    if (codes == null) {
                        continue;
                    }
                    for (TextCode code : codes) {
                        if (code != null && code.getContent() != null) {
                            builder.append(code.getContent());
                        }
                    }
                }
                if (builder.length() > MAX_SAMPLE_CHARS) {
                    break;
                }
            }
        }
        return builder.toString();
    }

    private String samplePdfText(Path path) throws IOException {
        StringBuilder builder = new StringBuilder();
        try (PDDocument document = Loader.loadPDF(path.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            for (int page : samplePages(document.getNumberOfPages())) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                builder.append(stripper.getText(document));
                if (builder.length() > MAX_SAMPLE_CHARS) {
                    break;
                }
            }
        }
        return builder.toString();
    }

    private int[] samplePages(int totalPages) {
        if (totalPages <= 3) {
            int[] pages = new int[totalPages];
            for (int i = 0; i < totalPages; i++) {
                pages[i] = i + 1;
            }
            return pages;
        }
        return new int[]{1, (totalPages + 1) / 2, totalPages};
    }

    private int countCjk(String text) {
        int count = 0;
        for (int index = 0; index < text.length(); index++) {
            char ch = text.charAt(index);
            if ((ch >= 0x4E00 && ch <= 0x9FFF) || (ch >= 0x3400 && ch <= 0x4DBF)) {
                count++;
            }
        }
        return count;
    }

    /**
     * PDF 转 OFD。
     *
     * <p>ofdrw 的 PDFConverter 会在内存中累积整份 OFD，页数一多就需要几个 GB。
     * 因此大文档拆成若干分片、并行转换，再用 OFDMerger 合并，把峰值内存压到单片级别。
     *
     * @return 是否走了分片模式（分片合并会丢失 PDF 书签）
     */
    public boolean pdfToOfd(Path source, Path output, Progress progress) throws IOException {
        int total;
        try (PDDocument document = Loader.loadPDF(source.toFile())) {
            total = document.getNumberOfPages();
        }
        if (total <= 0) {
            throw new IOException("源文档不包含任何页面");
        }
        long heapMb = Runtime.getRuntime().maxMemory() / (1024 * 1024);
        boolean textMode = canPreservePdfText(source);
        if (!shouldShard(total, heapMb)) {
            convertPdfSinglePass(source, output, total, textMode, progress);
            return false;
        }
        int shardPages = planShardPages(total, heapMb);
        convertPdfSharded(source, output, total, shardPages, heapMb, textMode, progress);
        return true;
    }

    /**
     * 单次转换的预估峰值超过堆的 75% 就分片；小文档保持单次（更快）。
     */
    static boolean shouldShard(int totalPages, long heapMb) {
        return totalPages * HEAP_MB_PER_PAGE_SINGLE > heapMb * SINGLE_PASS_HEAP_PERCENT / 100;
    }

    /**
     * 目标 10 片左右；同时受单片内存预算约束，避免大文档出现单片过大。
     */
    static int planShardPages(int totalPages, long heapMb) {
        return planShardPages(totalPages, heapMb, planWorkers(heapMb));
    }

    static int planShardPages(int totalPages, long heapMb, int workers) {
        long perShardBudgetMb = heapMb * 45 / 100 / Math.max(1, workers);
        int byMemory = (int) Math.max(SHARD_MIN_PAGES, perShardBudgetMb / HEAP_MB_PER_PAGE_SHARD);
        int byTarget = (int) Math.ceil(totalPages / (double) SHARD_TARGET_COUNT);
        int pages = Math.min(byTarget, Math.min(SHARD_MAX_PAGES, byMemory));
        return Math.max(1, Math.min(totalPages, Math.max(SHARD_MIN_PAGES, pages)));
    }

    /**
     * 实测：2GB 堆下 2 线程稳定（峰值约 1.4GB），每线程约需 900MB 余量。
     */
    static int planWorkers(long heapMb) {
        return planWorkers(heapMb, Runtime.getRuntime().availableProcessors());
    }

    static int planWorkers(long heapMb, int cpuCount) {
        int byHeap = (int) Math.max(1, Math.min(MAX_SHARD_WORKERS, heapMb / MB_PER_WORKER));
        int byCpu = Math.max(1, cpuCount / 2);
        return Math.max(1, Math.min(byHeap, byCpu));
    }

    private void convertPdfSinglePass(Path source, Path output, int total, boolean textMode, Progress progress) throws IOException {
        int chunk = chunkSize(total);
        DocConverter converter = null;
        IOException closeFailure = null;
        try {
            converter = newPdfConverter(textMode, output);
            if (converter instanceof PDFConverter textConverter) {
                textConverter.setEnableCopyBookmarks(true);
                textConverter.setEnableCopyAttachFiles(true);
            }
            for (int start = 0; start < total; start += chunk) {
                checkCanceled(progress);
                int end = Math.min(total, start + chunk);
                converter.convert(source, pageRange(start, end));
                report(progress, end, total, "正在转换第 ");
            }
        } finally {
            // 不能使用 try-with-resources：OOM 时 close() 会再次失败，
            // Java 的 addSuppressed 会抛 "Self-suppression not permitted" 把真实错误盖掉
            if (converter != null) {
                try {
                    converter.close();
                } catch (IOException ex) {
                    closeFailure = ex;
                    log.warn("关闭 PDF 转换器失败: {}", output, ex);
                }
            }
        }
        if (closeFailure != null) {
            throw closeFailure;
        }
    }

    /**
     * ofdrw 2.5.1 的 PDFConverter 默认走文字对象化，但只在 PDF 内嵌字体可完整复用时才生效；
     * 子集字体（缺 cmap）会逐个字体回退成路径绘制，实测慢 8 倍且输出相同。
     * 因此先判断字体能力：可保留文字才用文字模式，否则直接用图形模式。
     */
    private DocConverter newPdfConverter(boolean textMode, Path output) throws IOException {
        if (textMode) {
            log.info("PDF 内嵌字体可复用，使用文字模式转换（保留可选中文字）");
            PDFConverter converter = new PDFConverter(output);
            converter.setSubsetFont(true);
            return converter;
        }
        log.info("PDF 字体为子集或不可复用，使用图形模式转换（速度快、文字不可选中）");
        return new PDFGraphicsConverter(output);
    }

    /**
     * 判断整份 PDF 的字体是否都能转成 OFD 字体：需内嵌且字体程序带 cmap。
     */
    private boolean canPreservePdfText(Path source) {
        try (PDDocument document = Loader.loadPDF(source.toFile())) {
            Set<String> checked = new HashSet<>();
            for (PDPage page : document.getPages()) {
                PDResources resources = page.getResources();
                if (resources == null) {
                    continue;
                }
                for (COSName name : resources.getFontNames()) {
                    PDFont font;
                    try {
                        font = resources.getFont(name);
                    } catch (IOException | RuntimeException ex) {
                        return false;
                    }
                    if (font == null || !checked.add(font.getName())) {
                        continue;
                    }
                    if (!isTextCapable(font)) {
                        return false;
                    }
                }
            }
            return true;
        } catch (IOException | RuntimeException ex) {
            log.debug("字体能力判断失败，回退图形模式: {}", source, ex);
            return false;
        }
    }

    private boolean isTextCapable(PDFont font) {
        try {
            if (!font.isEmbedded()) {
                return false;
            }
            PDFontDescriptor descriptor = font.getFontDescriptor();
            if (descriptor == null || descriptor.getFontFile2() == null) {
                // CFF/Type1 等字体目前无法稳定转成 OFD 字体
                return false;
            }
            try (InputStream stream = descriptor.getFontFile2().createInputStream();
                 RandomAccessReadBuffer buffer = new RandomAccessReadBuffer(stream)) {
                TrueTypeFont ttf = new TTFParser().parse(buffer);
                return ttf.getCmap() != null;
            }
        } catch (IOException | RuntimeException ex) {
            return false;
        }
    }

    void convertPdfSharded(Path source, Path output, int total, int shardPages,
                           long heapMb, boolean textMode, Progress progress) throws IOException {
        int shardCount = (total + shardPages - 1) / shardPages;
        int workers = planWorkers(heapMb);
        log.info("PDF→OFD 分片转换: {} 页 / {} 片 / {} 线程（堆 {} MB）", total, shardCount, workers, heapMb);

        Path workDir = Files.createTempDirectory("adou-shard-");
        List<Path> parts = new ArrayList<>(shardCount);
        List<Path> shards = new ArrayList<>(shardCount);
        ExecutorService pool = Executors.newFixedThreadPool(workers, daemonFactory("adou-shard"));
        AtomicInteger finished = new AtomicInteger();
        long phaseStart = System.nanoTime();
        try {
            // 先整体拆分一次：避免每个分片都重新解析原始 PDF（27MB 手册每片解析要 2–4 秒）
            splitPdf(source, total, shardPages, workDir, parts, progress);
            long splitMs = (System.nanoTime() - phaseStart) / 1_000_000;
            checkCanceled(progress);

            List<Future<?>> futures = new ArrayList<>(shardCount);
            for (int index = 0; index < parts.size(); index++) {
                Path part = parts.get(index);
                Path shard = workDir.resolve(String.format("shard-%03d.ofd", index));
                shards.add(shard);
                int end = Math.min(total, (index + 1) * shardPages);
                futures.add(pool.submit(() -> {
                    checkCanceled(progress);
                    writePdfToOfd(part, shard, textMode);
                    int done = finished.incrementAndGet();
                    progress.update(12 + (int) Math.round(done * 58.0 / shardCount),
                            "正在转换第 " + end + "/" + total + " 页（分片 " + done + "/" + shardCount + "）");
                    return null;
                }));
            }
            for (Future<?> future : futures) {
                awaitShard(future);
            }
            long convertMs = (System.nanoTime() - phaseStart) / 1_000_000 - splitMs;
            checkCanceled(progress);
            progress.update(72, "正在合并 " + shardCount + " 个分片");
            long mergeStart = System.nanoTime();
            mergeShards(shards, output);
            long mergeMs = (System.nanoTime() - mergeStart) / 1_000_000;
            log.info("分片阶段耗时: 拆分 {} ms，转换 {} ms，合并 {} ms", splitMs, convertMs, mergeMs);
            progress.update(88, "分片合并完成");
        } finally {
            pool.shutdownNow();
            for (Path shard : shards) {
                deleteQuietly(shard);
            }
            for (Path part : parts) {
                deleteQuietly(part);
            }
            deleteQuietly(workDir);
        }
    }

    /**
     * 把源 PDF 按页拆成若干小 PDF（只解析一次），供并行转换使用。
     */
    private void splitPdf(Path source, int total, int shardPages, Path workDir,
                          List<Path> parts, Progress progress) throws IOException {
        int shardCount = (total + shardPages - 1) / shardPages;
        try (PDDocument document = Loader.loadPDF(source.toFile())) {
            for (int index = 0; index < shardCount; index++) {
                checkCanceled(progress);
                int start = index * shardPages;
                int end = Math.min(total, start + shardPages);
                Splitter splitter = new Splitter();
                splitter.setStartPage(start + 1);
                splitter.setEndPage(end);
                splitter.setSplitAtPage(end - start);
                List<PDDocument> documents = splitter.split(document);
                Path part = workDir.resolve(String.format("part-%03d.pdf", index));
                try {
                    documents.get(0).save(part.toFile());
                } finally {
                    for (PDDocument item : documents) {
                        item.close();
                    }
                }
                parts.add(part);
                progress.update(5 + (int) Math.round((index + 1) * 7.0 / shardCount),
                        "正在拆分文档（" + end + "/" + total + " 页）");
            }
        }
    }

    private void writePdfToOfd(Path part, Path shard, boolean textMode) throws IOException {
        DocConverter converter = null;
        IOException closeFailure = null;
        try {
            converter = newPdfConverter(textMode, shard);
            converter.convert(part);
        } finally {
            if (converter != null) {
                try {
                    converter.close();
                } catch (IOException ex) {
                    closeFailure = ex;
                    log.warn("关闭分片转换器失败: {}", shard, ex);
                }
            }
        }
        if (closeFailure != null) {
            throw closeFailure;
        }
    }

    private void mergeShards(List<Path> shards, Path output) throws IOException {
        IOException closeFailure = null;
        OFDMerger merger = null;
        try {
            merger = new OFDMerger(output);
            for (Path shard : shards) {
                merger.add(shard);
            }
        } finally {
            if (merger != null) {
                try {
                    merger.close();
                } catch (IOException ex) {
                    closeFailure = ex;
                    log.warn("关闭 OFD 合并器失败: {}", output, ex);
                }
            }
        }
        if (closeFailure != null) {
            throw closeFailure;
        }
    }

    private void awaitShard(Future<?> future) throws IOException {
        try {
            future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ConversionCanceledException();
        } catch (ExecutionException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof ConversionCanceledException canceled) {
                throw canceled;
            }
            if (cause instanceof OutOfMemoryError oom) {
                throw oom;
            }
            if (cause instanceof IOException io) {
                throw io;
            }
            throw new IOException("分片转换失败：" + (cause == null ? "未知错误" : cause.getMessage()), cause);
        }
    }

    private int[] pageRange(int start, int end) {
        int[] pages = new int[end - start];
        for (int i = start; i < end; i++) {
            pages[i - start] = i;
        }
        return pages;
    }

    private ThreadFactory daemonFactory(String prefix) {
        AtomicInteger counter = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + "-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }

    private void deleteQuietly(Path path) {
        try {
            if (path == null) {
                return;
            }
            if (Files.isDirectory(path)) {
                try (var entries = Files.list(path)) {
                    for (Path entry : entries.toList()) {
                        Files.deleteIfExists(entry);
                    }
                }
            }
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            log.debug("清理临时文件失败: {}", path, ex);
        }
    }

    /**
     * 校验输出文件：页数、体积、PDF 字体嵌入情况或 OFD 可提取文字。
     */
    public ConversionReport verify(Path output, String target, int sourcePages, long durationMs,
                                   ExportMode mode) throws IOException {
        long bytes = Files.isRegularFile(output) ? Files.size(output) : 0;
        List<String> warnings = new ArrayList<>();
        int outputPages;
        if ("PDF".equals(target)) {
            try (PDDocument document = Loader.loadPDF(output.toFile())) {
                outputPages = document.getNumberOfPages();
                List<String> fonts = nonEmbeddedFonts(document);
                if (mode == ExportMode.IMAGE) {
                    warnings.add("源文件字体无法嵌入 PDF，已按图像保真导出：版面一致，文字不可选中");
                } else if (!fonts.isEmpty()) {
                    warnings.add("部分字体未嵌入，其他阅读器打开时字形可能不同：" + String.join("、", fonts));
                }
            }
        } else {
            try (OFDReader reader = new OFDReader(output)) {
                outputPages = reader.getNumberOfPages();
                if (outputPages > 0 && !hasExtractableText(reader, outputPages)) {
                    warnings.add("输出为矢量图形，版面与原件一致，但文字不可选中或检索；需要可复制文字时请保留原 PDF");
                }
            }
        }
        if (bytes <= 0) {
            throw new IOException("转换结果为空文件");
        }
        if (outputPages <= 0) {
            throw new IOException("转换结果不包含任何页面");
        }
        if (outputPages != sourcePages) {
            warnings.add("页数不一致：源文档 " + sourcePages + " 页，输出 " + outputPages + " 页");
        }
        return new ConversionReport(sourcePages, outputPages, bytes, durationMs, List.copyOf(warnings));
    }

    /**
     * 单次转换内部的分块：每块都要重新解析源 PDF（120 页 12MB 约 2.5 秒/次），
     * 所以只切 2–3 块用于进度，不要按页数细分。
     */
    private int chunkSize(int totalPages) {
        if (totalPages <= 40) {
            return totalPages;
        }
        return Math.max(40, (int) Math.ceil(totalPages / 3.0));
    }

    private void checkCanceled(Progress progress) {
        if (progress.canceled()) {
            throw new ConversionCanceledException();
        }
    }

    private void report(Progress progress, int done, int total, String prefix) {
        int percent = PROGRESS_START + (int) Math.round(done * (double) PROGRESS_SPAN / total);
        progress.update(Math.min(percent, PROGRESS_START + PROGRESS_SPAN), prefix + done + "/" + total + " 页");
    }

    private List<String> nonEmbeddedFonts(PDDocument document) {
        Set<String> names = new LinkedHashSet<>();
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            if (resources == null) {
                continue;
            }
            for (COSName name : resources.getFontNames()) {
                try {
                    PDFont font = resources.getFont(name);
                    if (font != null && !font.isEmbedded()) {
                        names.add(font.getName());
                    }
                } catch (IOException | RuntimeException ex) {
                    log.debug("读取 PDF 字体失败: {}", name.getName(), ex);
                }
            }
        }
        List<String> list = new ArrayList<>(names);
        if (list.size() > MAX_REPORTED_FONTS) {
            return new ArrayList<>(list.subList(0, MAX_REPORTED_FONTS));
        }
        return list;
    }

    private boolean hasExtractableText(OFDReader reader, int totalPages) {
        int[] samples = samplePages(totalPages);
        try {
            ContentExtractor extractor = new ContentExtractor(reader);
            for (int page : samples) {
                List<TextObject> objects = extractor.getPageTextObject(page);
                if (objects == null) {
                    continue;
                }
                for (TextObject object : objects) {
                    List<TextCode> codes = object.getTextCodes();
                    if (codes == null) {
                        continue;
                    }
                    for (TextCode code : codes) {
                        if (code != null && code.getContent() != null && !code.getContent().isBlank()) {
                            return true;
                        }
                    }
                }
            }
        } catch (RuntimeException ex) {
            log.debug("转换结果文字探测失败，跳过该项校验", ex);
            return true;
        }
        return false;
    }
}

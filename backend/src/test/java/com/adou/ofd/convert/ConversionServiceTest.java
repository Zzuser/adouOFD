package com.adou.ofd.convert;

import com.adou.ofd.document.DemoOfdFactory;
import com.adou.ofd.document.DocumentService;
import com.adou.ofd.document.DocumentSummary;
import com.adou.ofd.document.PdfDemoFactory;
import com.adou.ofd.web.ApiException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.ofdrw.converter.ImageMaker;
import org.ofdrw.converter.ofdconverter.PDFConverter;
import org.ofdrw.reader.OFDReader;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConversionServiceTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private DocumentService documents;
    private Path workDir;
    private HeavyTaskExecutor executor;

    @BeforeEach
    void setUp() throws IOException {
        documents = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.7.1"));
        workDir = Files.createTempDirectory("adou-convert-test-");
        executor = new HeavyTaskExecutor();
    }

    @AfterEach
    void tearDown() {
        executor.shutdown();
        documents.closeAll();
    }

    @Test
    void convertsOfdToPdfWithMatchingPageCount() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("示例转换.pdf");

        ConversionJob job = service.submit(new ConversionRequest(demo.id(), null, null, output.toString(), false));
        assertEquals("QUEUED", job.status());
        assertEquals("PDF", job.target());
        assertTrue(job.progress() <= 10, "排队任务进度应从低位开始");

        ConversionJob done = waitForTerminal(service, job.id());
        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(100, done.progress());
        assertNotNull(done.report());
        assertEquals(demo.pageCount(), done.report().outputPages());
        assertTrue(Files.size(output) > 1000, "PDF 输出不应为空");
        boolean imageMode = done.report().warnings().stream().anyMatch((item) -> item.contains("图像保真"));
        try (PDDocument pdf = Loader.loadPDF(output.toFile())) {
            assertEquals(demo.pageCount(), pdf.getNumberOfPages(), "转换后页数应保持一致");
            BufferedImage page = new PDFRenderer(pdf).renderImageWithDPI(0, 72);
            assertTrue(hasInk(page), "PDF 首页应有可见内容");
            if (!imageMode) {
                String text = new PDFTextStripper().getText(pdf);
                // 不同字体的字形宽度不同，抽取时可能在汉字间插入空格
                assertTrue(text.replaceAll("\\s+", "").contains("阿豆"),
                        "矢量导出应保留中文文字：" + text.substring(0, Math.min(80, text.length())));
            }
        }
    }

    @Test
    void convertsPdfToOfdWithMatchingPageCount() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        DocumentSummary pdfDemo = documents.openPdfDemo();
        Path output = workDir.resolve("示例转换.ofd");

        ConversionJob job = service.submit(
                new ConversionRequest(null, pdfDemo.path(), "OFD", output.toString(), false));
        ConversionJob done = waitForTerminal(service, job.id());
        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(pdfDemo.pageCount(), done.report().outputPages());
        assertTrue(Files.size(output) > 1000, "OFD 输出不应为空");
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(pdfDemo.pageCount(), reader.getNumberOfPages(), "转换后页数应保持一致");
        }
    }

    @Test
    void convertsLongPdfInBatches() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        Path source = createTextPdf("长篇文档.pdf", 35);
        Path output = workDir.resolve("长篇文档.ofd");

        ConversionJob job = service.submit(new ConversionRequest(null, source.toString(), "OFD", output.toString(), false));
        ConversionJob done = waitForTerminal(service, job.id());
        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(35, reader.getNumberOfPages(), "分块转换不应丢页");
        }
        assertEquals(35, done.report().outputPages());
        assertTrue(done.report().warnings().stream().noneMatch((item) -> item.startsWith("页数不一致")),
                "分块转换不应产生页数告警：" + done.report().warnings());
    }

    @Test
    void decidesShardingByPageCountAndHeap() {
        assertFalse(ConversionEngine.shouldShard(50, 2048), "50 页应单次转换");
        assertFalse(ConversionEngine.shouldShard(120, 2048), "120 页在 2G 堆下仍可单次转换");
        assertTrue(ConversionEngine.shouldShard(130, 2048), "超过堆 75% 预估即分片");
        assertTrue(ConversionEngine.shouldShard(100, 1024), "100 页在 1G 堆下必须分片");
        assertTrue(ConversionEngine.shouldShard(404, 2048), "404 页在 2G 堆下必须分片");
    }

    @Test
    void plansShardSizeAndWorkersByHeap() {
        assertEquals(1, ConversionEngine.planWorkers(1024, 8));
        assertEquals(2, ConversionEngine.planWorkers(2048, 8));
        assertEquals(3, ConversionEngine.planWorkers(3072, 8));
        assertEquals(1, ConversionEngine.planWorkers(3072, 2), "低 CPU 机器不能超过 CPU/2");

        // 目标约 10 片；同时受单片内存预算约束（2G 堆 / 2 线程 → 最多 38 页一片）
        assertEquals(20, ConversionEngine.planShardPages(200, 2048, 2));
        assertEquals(38, ConversionEngine.planShardPages(404, 2048, 2));
        assertEquals(38, ConversionEngine.planShardPages(2000, 2048, 2), "超大文档也不能让单片超过内存预算");
        assertEquals(20, ConversionEngine.planShardPages(60, 1024, 1), "单片不小于 20 页");
    }

    @Test
    void shardedConversionKeepsPageCountAndOrder() throws Exception {
        Path pdf = createTextPdf("分片输入.pdf", 23);
        Path output = workDir.resolve("分片输出.ofd");
        ConversionEngine engine = new ConversionEngine();

        engine.convertPdfSharded(pdf, output, 23, 5, 2048, false, new ConversionEngine.Progress() {
            @Override
            public void update(int percent, String phase) {
                // 单元测试不关心进度
            }

            @Override
            public boolean canceled() {
                return false;
            }
        });

        assertTrue(Files.size(output) > 0, "分片合并后应生成 OFD");
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(23, reader.getNumberOfPages(), "分片合并不能丢页");
        }

        // PDF→OFD 会把文字转成矢量路径，只能靠渲染比对确认内容与页序
        Path refFirst = convertSinglePage(pdf, 0);
        Path refSixth = convertSinglePage(pdf, 5);
        assertTrue(sameImage(renderPage(output, 1), renderPage(refFirst, 1)), "第 1 页内容与单页转换不一致");
        assertTrue(sameImage(renderPage(output, 6), renderPage(refSixth, 1)), "分片边界第 6 页页序错误");
    }

    private Path convertSinglePage(Path pdf, int pageIndex) throws IOException {
        Path out = workDir.resolve("ref-" + pageIndex + ".ofd");
        try (PDFConverter converter = new PDFConverter(out)) {
            converter.convert(pdf, new int[]{pageIndex});
        }
        return out;
    }

    private BufferedImage renderPage(Path ofd, int page) throws IOException {
        try (OFDReader reader = new OFDReader(ofd)) {
            return new ImageMaker(reader, 2.0).makePage(page - 1);
        }
    }

    private boolean sameImage(BufferedImage left, BufferedImage right) {
        if (left.getWidth() != right.getWidth() || left.getHeight() != right.getHeight()) {
            return false;
        }
        long diff = 0;
        for (int y = 0; y < left.getHeight(); y += 2) {
            for (int x = 0; x < left.getWidth(); x += 2) {
                if (left.getRGB(x, y) != right.getRGB(x, y)) {
                    diff++;
                }
            }
        }
        return diff * 200 < (long) (left.getWidth() / 2) * (left.getHeight() / 2);
    }

    @Test
    void appendsMissingExtensionAndRejectsUnknownTarget() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("无扩展名");

        ConversionJob job = service.submit(new ConversionRequest(demo.id(), null, "pdf", output.toString(), false));
        assertTrue(job.outputPath().endsWith(".pdf"), "缺少扩展名时应自动补全：" + job.outputPath());
        assertEquals("SUCCEEDED", waitForTerminal(service, job.id()).status());
        assertTrue(Files.exists(workDir.resolve("无扩展名.pdf")));

        ApiException error = assertThrows(ApiException.class, () -> service.submit(
                new ConversionRequest(demo.id(), null, "DOCX", workDir.resolve("非法.docx").toString(), false)));
        assertEquals("INVALID_TARGET", error.getCode());
    }

    @Test
    void refusesToOverwriteWithoutPermission() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("已存在.pdf");
        Files.writeString(output, "占位");

        ApiException error = assertThrows(ApiException.class, () -> service.submit(
                new ConversionRequest(demo.id(), null, "PDF", output.toString(), false)));
        assertEquals("OUTPUT_EXISTS", error.getCode());

        ConversionJob job = service.submit(
                new ConversionRequest(demo.id(), null, "PDF", output.toString(), true));
        assertEquals("SUCCEEDED", waitForTerminal(service, job.id()).status());
        assertTrue(Files.size(output) > 1000, "覆盖后应写入真实 PDF");
    }

    @Test
    void probesBatchInputsWithoutTouchingSessions() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path missing = workDir.resolve("不存在.pdf");

        List<ProbeResult> results = service.probe(List.of(demo.path(), missing.toString(), "   "));

        assertEquals(2, results.size(), "空白路径应被跳过");
        assertEquals("OFD", results.get(0).kind());
        assertEquals(demo.pageCount(), results.get(0).pages());
        assertNull(results.get(0).error());
        assertTrue(results.get(0).size() > 0);
        assertNotNull(results.get(1).error(), "不存在的文件应返回错误而不是抛异常");
    }

    @Test
    void rejectsSameFormatConversion() throws Exception {
        ConversionService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        ApiException error = assertThrows(ApiException.class, () -> service.submit(
                new ConversionRequest(demo.id(), null, "OFD", workDir.resolve("同格式.ofd").toString(), false)));
        assertEquals("SAME_FORMAT", error.getCode());
    }

    @Test
    void cancelQueuedJobKeepsQueueMoving() throws Exception {
        SlowEngine engine = new SlowEngine();
        ConversionService service = newService(engine);
        DocumentSummary demo = documents.openDemo();

        ConversionJob first = service.submit(
                new ConversionRequest(demo.id(), null, "PDF", workDir.resolve("第一个.pdf").toString(), false));
        assertTrue(engine.started.await(10, TimeUnit.SECONDS), "首个任务应进入转换引擎");

        Path secondOutput = workDir.resolve("第二个.pdf");
        ConversionJob second = service.submit(
                new ConversionRequest(demo.id(), null, "PDF", secondOutput.toString(), false));
        assertEquals("QUEUED", second.status(), "单工作线程下第二个任务应排队");

        ConversionJob canceled = service.cancel(second.id());
        assertEquals("CANCELED", canceled.status());

        engine.release.countDown();
        assertEquals("SUCCEEDED", waitForTerminal(service, first.id()).status());
        assertFalse(Files.exists(secondOutput), "被取消的任务不应产出文件");
    }

    @Test
    void cancelRunningJobRemovesPartialOutput() throws Exception {
        SlowEngine engine = new SlowEngine();
        ConversionService service = newService(engine);
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("中途取消.pdf");

        ConversionJob job = service.submit(new ConversionRequest(demo.id(), null, "PDF", output.toString(), false));
        assertTrue(engine.started.await(10, TimeUnit.SECONDS), "任务应进入转换引擎");
        assertEquals("RUNNING", service.get(job.id()).status());

        service.cancel(job.id());
        engine.release.countDown();

        ConversionJob done = waitForTerminal(service, job.id());
        assertEquals("CANCELED", done.status());
        assertFalse(Files.exists(output), "取消后不应保留输出文件");
    }

    @Test
    void marksJobFailedWhenEngineRunsOutOfMemory() throws Exception {
        ConversionService service = newService(new OutOfMemoryEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("内存不足.pdf");

        ConversionJob job = service.submit(
                new ConversionRequest(demo.id(), null, "PDF", output.toString(), false));
        ConversionJob done = waitForTerminal(service, job.id());

        assertEquals("FAILED", done.status(), "OOM 是 Error，任务必须落到终态而不是一直 RUNNING");
        assertEquals("OUT_OF_MEMORY", done.errorCode());
        assertTrue(done.errorMessage().contains("内存不足"), done.errorMessage());
        assertFalse(Files.exists(output), "失败时不应留下输出文件");
    }

    private ConversionService newService(ConversionEngine engine) {
        return new ConversionService(documents, engine, executor);
    }

    private ConversionJob waitForTerminal(ConversionService service, String id) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(90);
        while (System.nanoTime() < deadline) {
            ConversionJob job = service.get(id);
            if (ConversionStatus.valueOf(job.status()).terminal()) {
                return job;
            }
            Thread.sleep(50);
        }
        return service.get(id);
    }

    private boolean hasInk(BufferedImage image) {
        long ink = 0;
        for (int y = 0; y < image.getHeight(); y += 4) {
            for (int x = 0; x < image.getWidth(); x += 4) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;
                if (r + g + b < 600) {
                    ink++;
                }
            }
        }
        return ink > 100;
    }

    private Path createTextPdf(String name, int pages) throws IOException {
        Path file = workDir.resolve(name);
        try (PDDocument document = new PDDocument()) {
            for (int index = 1; index <= pages; index++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                    stream.beginText();
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    stream.newLineAtOffset(72, 760);
                    stream.showText("ADou OFD conversion fixture - page " + index);
                    stream.endText();
                }
            }
            document.save(file.toFile());
        }
        return file;
    }

    /**
     * 模拟引擎内存耗尽：验证 Error 也能让任务进入终态。
     */
    private static final class OutOfMemoryEngine extends ConversionEngine {

        @Override
        public ExportMode ofdToPdf(Path source, Path output, Progress progress) {
            throw new OutOfMemoryError("simulated");
        }
    }

    /**
     * 可控引擎：用于验证排队、取消等时序敏感行为。
     */
    private static final class SlowEngine extends ConversionEngine {

        private final CountDownLatch started = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        @Override
        public ConversionEngine.ExportMode ofdToPdf(Path source, Path output, Progress progress) throws IOException {
            started.countDown();
            try {
                release.await(20, TimeUnit.SECONDS);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
            if (progress.canceled()) {
                throw new ConversionCanceledException();
            }
            return super.ofdToPdf(source, output, progress);
        }
    }
}

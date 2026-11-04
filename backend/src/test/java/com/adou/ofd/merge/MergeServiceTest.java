package com.adou.ofd.merge;

import com.adou.ofd.convert.ConversionCanceledException;
import com.adou.ofd.convert.ConversionEngine;
import com.adou.ofd.convert.ConversionStatus;
import com.adou.ofd.convert.HeavyTaskExecutor;
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
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.ofdrw.layout.OFDDoc;
import org.ofdrw.layout.element.Img;
import org.ofdrw.reader.OFDReader;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MergeServiceTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private DocumentService documents;
    private Path workDir;
    private HeavyTaskExecutor executor;

    @BeforeEach
    void setUp() throws IOException {
        documents = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.7.1"));
        workDir = Files.createTempDirectory("adou-merge-test-");
        executor = new HeavyTaskExecutor();
    }

    @AfterEach
    void tearDown() {
        executor.shutdown();
        documents.closeAll();
    }

    @Test
    void mergesPdfFilesInListOrder() throws Exception {
        MergeService service = newService(new ConversionEngine());
        Path alpha = createTextPdf("alpha.pdf", "ALPHA", 2);
        Path beta = createTextPdf("beta.pdf", "BETA", 1);
        Path output = workDir.resolve("merged.pdf");

        MergeJob job = service.submit(new MergeRequest(
                List.of(beta.toString(), alpha.toString()), "PDF", output.toString(), false));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(3, done.report().outputPages());
        assertEquals(2, done.report().sourceFiles());
        try (PDDocument document = Loader.loadPDF(output.toFile())) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.indexOf("BETA") < text.indexOf("ALPHA"), "应按列表顺序合并：" + text);
        }
    }

    @Test
    void mergesSameOfdTwiceWithoutDroppingPages() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("duplicate.ofd");

        MergeJob job = service.submit(new MergeRequest(
                List.of(demo.path(), demo.path()), "OFD", output.toString(), false));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(8, done.report().outputPages());
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(8, reader.getNumberOfPages(), "同名文件重复加入时不应去重");
        }
    }

    @Test
    void repairsMissingOfdResourceBeforeMerge() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path imageOfd = createImageOfdWithMissingResource("图片文档");
        Path output = workDir.resolve("repaired.ofd");

        MergeJob job = service.submit(new MergeRequest(
                List.of(imageOfd.toString(), demo.path()), "OFD", output.toString(), false));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(5, done.report().outputPages());
        assertTrue(done.report().warnings().stream().anyMatch((w) -> w.contains("占位文件")),
                done.report().warnings().toString());
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(5, reader.getNumberOfPages());
        }
    }

    @Test
    void mergesReadOnlyOfdWithMissingResource() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path imageOfd = createImageOfdWithMissingResource("只读图片");
        assertTrue(imageOfd.toFile().setReadOnly(), "测试前置：源文件应设为只读");
        Path output = workDir.resolve("readonly.ofd");

        try {
            MergeJob job = service.submit(new MergeRequest(
                    List.of(imageOfd.toString(), demo.path()), "OFD", output.toString(), false));
            MergeJob done = waitForTerminal(service, job.id());

            assertEquals("SUCCEEDED", done.status(), done.errorMessage());
            assertEquals(5, done.report().outputPages());
            assertTrue(done.report().warnings().stream().anyMatch((w) -> w.contains("占位文件")),
                    done.report().warnings().toString());
        } finally {
            imageOfd.toFile().setWritable(true);
        }
    }

    @Test
    void mergesToPdfWithExplicitImageMode() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("image-mode.pdf");

        MergeJob job = service.submit(new MergeRequest(
                List.of(demo.path(), demo.path()), "PDF", output.toString(), false, "IMAGE"));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(8, done.report().outputPages());
        assertTrue(done.report().warnings().stream().anyMatch((w) -> w.contains("图像保真")),
                done.report().warnings().toString());
    }

    @Test
    void mergesToPdfWithExplicitVectorMode() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("vector-mode.pdf");

        MergeJob job = service.submit(new MergeRequest(
                List.of(demo.path(), demo.path()), "PDF", output.toString(), false, "VECTOR"));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(8, done.report().outputPages());
        assertFalse(done.report().warnings().stream().anyMatch((w) -> w.contains("图像保真")),
                done.report().warnings().toString());
    }

    @Test
    void mergesMixedInputsToOfd() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary ofd = documents.openDemo();
        DocumentSummary pdf = documents.openPdfDemo();
        Path output = workDir.resolve("mixed.ofd");

        MergeJob job = service.submit(new MergeRequest(
                List.of(pdf.path(), ofd.path()), "OFD", output.toString(), false));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(7, done.report().outputPages());
        assertTrue(done.report().warnings().stream().anyMatch((w) -> w.contains("转换为 OFD")),
                done.report().warnings().toString());
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(7, reader.getNumberOfPages());
        }
    }

    @Test
    void mergesMixedInputsToPdfInListOrder() throws Exception {
        MergeService service = newService(new ConversionEngine());
        DocumentSummary ofd = documents.openDemo();
        Path first = createTextPdf("mixed-first.pdf", "FIRST", 1);
        Path output = workDir.resolve("mixed.pdf");

        MergeJob job = service.submit(new MergeRequest(
                List.of(first.toString(), ofd.path()), "PDF", output.toString(), false));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(5, done.report().outputPages());
        try (PDDocument document = Loader.loadPDF(output.toFile())) {
            PDFTextStripper firstPage = new PDFTextStripper();
            firstPage.setStartPage(1);
            firstPage.setEndPage(1);
            assertTrue(firstPage.getText(document).contains("FIRST"),
                    "PDF 输入在前时第 1 页应来自 PDF");
        }
    }

    @Test
    void rejectsInvalidRequests() throws Exception {
        MergeService service = newService(new ConversionEngine());
        Path first = createTextPdf("first.pdf", "FIRST", 1);
        Path second = createTextPdf("second.pdf", "SECOND", 1);
        Path txt = workDir.resolve("note.txt");
        Files.writeString(txt, "not a document");
        Path existing = workDir.resolve("existing.pdf");
        Files.writeString(existing, "occupied");

        assertCode("NEED_TWO_FILES", () -> service.submit(new MergeRequest(
                List.of(first.toString()), "PDF", workDir.resolve("a.pdf").toString(), false)));
        assertCode("INVALID_TARGET", () -> service.submit(new MergeRequest(
                List.of(first.toString(), second.toString()), "DOCX",
                workDir.resolve("b.docx").toString(), false)));
        assertCode("INVALID_PDF_MODE", () -> service.submit(new MergeRequest(
                List.of(first.toString(), second.toString()), "PDF",
                workDir.resolve("b-mode.pdf").toString(), false, "TINY")));
        assertCode("UNSUPPORTED_FORMAT", () -> service.submit(new MergeRequest(
                List.of(first.toString(), txt.toString()), "PDF",
                workDir.resolve("c.pdf").toString(), false)));
        assertCode("SOURCE_IS_OUTPUT", () -> service.submit(new MergeRequest(
                List.of(first.toString(), second.toString()), "PDF", first.toString(), false)));
        assertCode("OUTPUT_EXISTS", () -> service.submit(new MergeRequest(
                List.of(first.toString(), second.toString()), "PDF", existing.toString(), false)));
    }

    @Test
    void reportsOutOfMemoryAsFailure() throws Exception {
        MergeService service = newService(new OutOfMemoryEngine());
        DocumentSummary ofd = documents.openDemo();
        DocumentSummary pdf = documents.openPdfDemo();
        Path output = workDir.resolve("oom.pdf");

        MergeJob job = service.submit(new MergeRequest(
                List.of(ofd.path(), pdf.path()), "PDF", output.toString(), false));
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("FAILED", done.status());
        assertEquals("OUT_OF_MEMORY", done.errorCode());
        assertFalse(Files.exists(output), "失败时不应留下输出文件");
    }

    @Test
    void cancelsRunningMerge() throws Exception {
        MergeService service = newService(new SlowEngine());
        Path first = createTextPdf("slow-1.pdf", "SLOW1", 1);
        Path second = createTextPdf("slow-2.pdf", "SLOW2", 1);
        Path output = workDir.resolve("canceled.ofd");

        MergeJob job = service.submit(new MergeRequest(
                List.of(first.toString(), second.toString()), "OFD", output.toString(), false));
        waitForStatus(service, job.id(), ConversionStatus.RUNNING);
        service.cancel(job.id());
        MergeJob done = waitForTerminal(service, job.id());

        assertEquals("CANCELED", done.status());
        assertFalse(Files.exists(output), "取消后不应保留输出文件");
    }

    private MergeService newService(ConversionEngine engine) {
        return new MergeService(engine,
                new MergeEngine(engine, new OfdResourceRepair(), new OfdStyleRepair()), executor);
    }

    private MergeJob waitForTerminal(MergeService service, String id) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(120);
        while (System.nanoTime() < deadline) {
            MergeJob job = service.get(id);
            if (ConversionStatus.valueOf(job.status()).terminal()) {
                return job;
            }
            Thread.sleep(50);
        }
        return service.get(id);
    }

    private void waitForStatus(MergeService service, String id, ConversionStatus status)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        while (System.nanoTime() < deadline) {
            if (status.name().equals(service.get(id).status())) {
                return;
            }
            Thread.sleep(20);
        }
    }

    private void assertCode(String code, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(code, error.getCode(), error.getMessage());
    }

    private Path createImageOfdWithMissingResource(String name) throws IOException {
        Path image = workDir.resolve(name + ".png");
        BufferedImage canvas = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        ImageIO.write(canvas, "png", image.toFile());
        Path ofd = workDir.resolve(name + ".ofd");
        try (OFDDoc document = new OFDDoc(ofd)) {
            document.add(new Img(20, 20, image));
        }

        Set<String> remove;
        try (ZipFile zip = new ZipFile(ofd.toFile())) {
            remove = zip.stream()
                    .map(ZipEntry::getName)
                    .filter((entry) -> entry.startsWith("Doc_0/Res/")
                            && entry.toLowerCase().endsWith(".png"))
                    .collect(Collectors.toSet());
        }
        assertTrue(!remove.isEmpty(), "示例 OFD 应包含图片资源");

        Path temp = workDir.resolve(name + "-missing.ofd");
        try (ZipFile zip = new ZipFile(ofd.toFile());
             ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(temp))) {
            for (ZipEntry entry : Collections.list(zip.entries())) {
                if (remove.contains(entry.getName())) {
                    continue;
                }
                out.putNextEntry(new ZipEntry(entry.getName()));
                try (var in = zip.getInputStream(entry)) {
                    in.transferTo(out);
                }
                out.closeEntry();
            }
        }
        Files.move(temp, ofd, StandardCopyOption.REPLACE_EXISTING);
        return ofd;
    }

    private Path createTextPdf(String name, String label, int pages) throws IOException {
        Path file = workDir.resolve(name);
        try (PDDocument document = new PDDocument()) {
            for (int index = 1; index <= pages; index++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                    stream.beginText();
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                    stream.newLineAtOffset(72, 760);
                    stream.showText(label + "-" + index);
                    stream.endText();
                }
            }
            document.save(file.toFile());
        }
        return file;
    }

    private static final class OutOfMemoryEngine extends ConversionEngine {
        @Override
        public ExportMode ofdToPdf(Path source, Path output, Progress progress) {
            throw new OutOfMemoryError("simulated");
        }
    }

    private static final class SlowEngine extends ConversionEngine {
        @Override
        public boolean pdfToOfd(Path source, Path output, Progress progress) {
            for (int index = 0; index < 100; index++) {
                if (progress.canceled()) {
                    throw new ConversionCanceledException();
                }
                try {
                    Thread.sleep(50);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new ConversionCanceledException();
                }
            }
            return false;
        }
    }
}

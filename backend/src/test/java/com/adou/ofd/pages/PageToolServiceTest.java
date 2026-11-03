package com.adou.ofd.pages;

import com.adou.ofd.convert.ConversionEngine;
import com.adou.ofd.convert.ConversionStatus;
import com.adou.ofd.convert.HeavyTaskExecutor;
import com.adou.ofd.document.DemoOfdFactory;
import com.adou.ofd.document.DocumentService;
import com.adou.ofd.document.DocumentSummary;
import com.adou.ofd.document.PdfDemoFactory;
import com.adou.ofd.merge.OfdResourceRepair;
import com.adou.ofd.merge.OfdStyleRepair;
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
import org.ofdrw.reader.OFDReader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PageToolServiceTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private DocumentService documents;
    private PageToolService service;
    private Path workDir;
    private HeavyTaskExecutor executor;

    @BeforeEach
    void setUp() throws IOException {
        documents = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.8.0"));
        workDir = Files.createTempDirectory("adou-pages-test-");
        executor = new HeavyTaskExecutor();
        ConversionEngine engine = new ConversionEngine();
        service = new PageToolService(engine,
                new PageToolEngine(engine, new OfdResourceRepair(), new OfdStyleRepair()),
                executor);
    }

    @AfterEach
    void tearDown() throws IOException {
        executor.shutdown();
        documents.closeAll();
        try (Stream<Path> paths = Files.walk(workDir)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach((path) -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // 测试临时目录清理失败不影响断言
                }
            });
        }
    }

    @Test
    void splitsPdfEveryPage() throws Exception {
        Path source = createTextPdf("invoice.pdf", "P", 3);
        Path outputDir = workDir.resolve("page-split");

        PageToolJob job = service.submitSplit(new SplitRequest(
                source.toString(), "PAGE", null, null, outputDir.toString(), "invoice"));
        PageToolJob done = waitForTerminal(job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(3, done.outputFiles());
        assertEquals(3, done.outputPages());
        assertEquals(3, done.outputs().size());
        for (PageOutput output : done.outputs()) {
            assertEquals(1, output.pages());
            assertTrue(Files.isRegularFile(Path.of(output.path())), output.path());
        }
        try (PDDocument first = Loader.loadPDF(Path.of(done.outputs().get(0).path()).toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            assertTrue(stripper.getText(first).contains("P-1"));
        }
    }

    @Test
    void splitsPdfByChunk() throws Exception {
        Path source = createTextPdf("chunk.pdf", "C", 5);
        Path outputDir = workDir.resolve("chunk-split");

        PageToolJob job = service.submitSplit(new SplitRequest(
                source.toString(), "CHUNK", 2, null, outputDir.toString(), null));
        PageToolJob done = waitForTerminal(job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(3, done.outputFiles());
        assertEquals(List.of(2, 2, 1),
                done.outputs().stream().map(PageOutput::pages).toList());
    }

    @Test
    void splitsOfdByRanges() throws Exception {
        DocumentSummary demo = documents.openDemo();
        Path outputDir = workDir.resolve("ofd-split");

        PageToolJob job = service.submitSplit(new SplitRequest(
                demo.path(), "RANGES", null, "1-2,3-4", outputDir.toString(), "demo"));
        PageToolJob done = waitForTerminal(job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(2, done.outputFiles());
        assertEquals(4, done.outputPages());
        try (OFDReader first = new OFDReader(Path.of(done.outputs().get(0).path()))) {
            assertEquals(2, first.getNumberOfPages());
        }
        try (OFDReader second = new OFDReader(Path.of(done.outputs().get(1).path()))) {
            assertEquals(2, second.getNumberOfPages());
        }
    }

    @Test
    void insertsPdfPagesIntoPdfBeforePage() throws Exception {
        Path base = createTextPdf("base.pdf", "B", 3);
        Path insert = createTextPdf("insert.pdf", "I", 2);
        Path output = workDir.resolve("inserted.pdf");

        PageToolJob job = service.submitInsert(new InsertRequest(
                base.toString(), insert.toString(), "2", "BEFORE", 2, output.toString(), true));
        PageToolJob done = waitForTerminal(job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(4, done.outputPages());
        assertEquals(1, done.outputFiles());
        try (PDDocument document = Loader.loadPDF(output.toFile())) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.indexOf("B-1") < text.indexOf("I-2"), text);
            assertTrue(text.indexOf("I-2") < text.indexOf("B-2"), text);
            assertTrue(text.indexOf("B-2") < text.indexOf("B-3"), text);
        }
    }

    @Test
    void insertsPdfPageIntoOfdAtEnd() throws Exception {
        DocumentSummary demo = documents.openDemo();
        Path insert = createTextPdf("insert-one.pdf", "TAIL", 1);
        Path output = workDir.resolve("ofd-with-tail.ofd");

        PageToolJob job = service.submitInsert(new InsertRequest(
                demo.path(), insert.toString(), null, "END", null, output.toString(), true));
        PageToolJob done = waitForTerminal(job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(5, done.outputPages());
        try (OFDReader reader = new OFDReader(output)) {
            assertEquals(5, reader.getNumberOfPages());
        }
    }

    @Test
    void insertsOfdPagesIntoPdfAtStart() throws Exception {
        Path base = createTextPdf("pdf-base.pdf", "B", 2);
        DocumentSummary demo = documents.openDemo();
        Path output = workDir.resolve("pdf-with-ofd.pdf");

        PageToolJob job = service.submitInsert(new InsertRequest(
                base.toString(), demo.path(), "1", "START", null, output.toString(), true));
        PageToolJob done = waitForTerminal(job.id());

        assertEquals("SUCCEEDED", done.status(), done.errorMessage());
        assertEquals(3, done.outputPages());
        try (PDDocument document = Loader.loadPDF(output.toFile())) {
            assertEquals(3, document.getNumberOfPages());
        }
    }

    @Test
    void rejectsInvalidRequests() throws Exception {
        Path source = createTextPdf("invalid.pdf", "X", 2);
        Path outputDir = workDir.resolve("invalid-output");

        assertCode("INVALID_RANGES", () -> service.submitSplit(new SplitRequest(
                source.toString(), "RANGES", null, "1-", outputDir.toString(), null)));
        assertCode("PAGE_OUT_OF_RANGE", () -> service.submitSplit(new SplitRequest(
                source.toString(), "RANGES", null, "1-3", outputDir.toString(), null)));
        assertCode("INVALID_CHUNK_SIZE", () -> service.submitSplit(new SplitRequest(
                source.toString(), "CHUNK", 0, null, outputDir.toString(), null)));
        assertCode("INVALID_POSITION", () -> service.submitInsert(new InsertRequest(
                source.toString(), source.toString(), "1", "BEFORE", 5,
                workDir.resolve("bad.pdf").toString(), true)));
        assertCode("SOURCE_IS_OUTPUT", () -> service.submitInsert(new InsertRequest(
                source.toString(), source.toString(), "1", "END", null, source.toString(), true)));
    }

    @Test
    void rejectsOutOfRangeInsertWithoutOutput() throws Exception {
        Path base = createTextPdf("fail-base.pdf", "B", 1);
        Path insert = createTextPdf("fail-insert.pdf", "I", 1);
        Path output = workDir.resolve("failed.pdf");

        assertCode("PAGE_OUT_OF_RANGE", () -> service.submitInsert(new InsertRequest(
                base.toString(), insert.toString(), "9", "END", null, output.toString(), true)));
        assertFalse(Files.exists(output), "参数校验失败时不应留下输出文件");
    }

    private PageToolJob waitForTerminal(String id) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(180);
        while (System.nanoTime() < deadline) {
            PageToolJob job = service.get(id);
            if (ConversionStatus.valueOf(job.status()).terminal()) {
                return job;
            }
            Thread.sleep(50);
        }
        return service.get(id);
    }

    private void assertCode(String code, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(code, error.getCode(), error.getMessage());
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
}

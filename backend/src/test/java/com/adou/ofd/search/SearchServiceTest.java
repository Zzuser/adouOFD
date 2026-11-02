package com.adou.ofd.search;

import com.adou.ofd.document.DemoOfdFactory;
import com.adou.ofd.document.DocumentService;
import com.adou.ofd.document.DocumentSummary;
import com.adou.ofd.document.PdfDemoFactory;
import com.adou.ofd.web.ApiException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SearchServiceTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private DocumentService documents;
    private SearchService searches;
    private Path workDir;

    @BeforeEach
    void setUp() throws IOException {
        documents = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.7.1"));
        searches = new SearchService(documents);
        workDir = Files.createTempDirectory("adou-search-test-");
    }

    @AfterEach
    void tearDown() {
        searches.shutdown();
        documents.closeAll();
    }

    @Test
    void findsMatchesAcrossPagesWithSnippetsAndCoordinates() throws Exception {
        Path pdf = createMultiPagePdf("alpha.pdf",
                new String[]{"Page one alpha text"},
                new String[]{"Page two alpha beta"});
        DocumentSummary document = documents.open(pdf.toString());

        SearchJob job = search(document.id(), "alpha", false);

        assertEquals("SUCCEEDED", job.status(), job.errorMessage());
        assertEquals(2, job.matchCount());
        assertEquals(2, job.scannedPages());
        assertEquals(100, job.progress());
        assertEquals(2, job.hits().size());
        assertEquals(1, job.hits().get(0).page());
        assertEquals(2, job.hits().get(1).page());
        assertEquals("alpha", job.hits().get(0).match());
        assertTrue(job.hits().get(0).before().contains("Page one"), job.hits().get(0).before());
        assertTrue(job.hits().get(0).x() >= 0 && job.hits().get(0).x() <= 1);
        assertTrue(job.hits().get(0).y() >= 0 && job.hits().get(0).y() <= 1);
        assertTrue(job.hits().get(0).height() > 0);
        assertFalse(job.hits().get(0).beforeTruncated());
    }

    @Test
    void respectsCaseSensitivity() throws Exception {
        Path pdf = createPdf("case.pdf", "Hello hello HELLO");
        DocumentSummary document = documents.open(pdf.toString());

        SearchJob insensitive = search(document.id(), "HELLO", false);
        SearchJob sensitive = search(document.id(), "HELLO", true);

        assertEquals(3, insensitive.matchCount());
        assertEquals(1, sensitive.matchCount());
        assertEquals("HELLO", sensitive.hits().get(0).match());
    }

    @Test
    void matchesPhraseAcrossLineBreaksAndCollapsesWhitespace() throws Exception {
        Path pdf = createPdf("phrase.pdf", "alpha", "beta");
        DocumentSummary document = documents.open(pdf.toString());

        SearchJob job = search(document.id(), "alpha   beta", false);

        assertEquals("SUCCEEDED", job.status(), job.errorMessage());
        assertEquals(1, job.matchCount());
        assertEquals("alpha beta", job.hits().get(0).match());
    }

    @Test
    void capsStoredHitsButCountsAllMatches() throws Exception {
        Path pdf = createPdf("many.pdf", "needle ".repeat(350));
        DocumentSummary document = documents.open(pdf.toString());

        SearchJob job = search(document.id(), "needle", false);

        assertEquals("SUCCEEDED", job.status(), job.errorMessage());
        assertEquals(350, job.matchCount());
        assertEquals(SearchTask.MAX_HITS, job.hits().size());
        assertTrue(job.truncated());
    }

    @Test
    void rejectsBlankAndOversizedQueries() throws Exception {
        Path pdf = createPdf("invalid.pdf", "text");
        DocumentSummary document = documents.open(pdf.toString());

        assertCode("SEARCH_QUERY_REQUIRED", () -> searches.submit(document.id(), new SearchRequest("   ", false)));
        assertCode("SEARCH_QUERY_REQUIRED", () -> searches.submit(document.id(), null));
        assertCode("SEARCH_QUERY_TOO_LONG",
                () -> searches.submit(document.id(), new SearchRequest("x".repeat(201), false)));
    }

    @Test
    void unknownDocumentIsRejected() {
        assertCode("SESSION_NOT_FOUND",
                () -> searches.submit("missing", new SearchRequest("text", false)));
    }

    private SearchJob search(String documentId, String query, boolean caseSensitive) throws InterruptedException {
        SearchJob started = searches.submit(documentId, new SearchRequest(query, caseSensitive));
        assertNotNull(started.id());
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
        while (System.nanoTime() < deadline) {
            SearchJob job = searches.get(documentId, started.id());
            if (!"RUNNING".equals(job.status())) {
                return job;
            }
            Thread.sleep(20);
        }
        return searches.get(documentId, started.id());
    }

    private void assertCode(String code, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(code, error.getCode(), error.getMessage());
    }

    private Path createPdf(String name, String... lines) throws IOException {
        return createMultiPagePdf(name, lines);
    }

    private Path createMultiPagePdf(String name, String[]... pages) throws IOException {
        Path file = workDir.resolve(name);
        try (PDDocument document = new PDDocument()) {
            for (String[] lines : pages) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(56, 760);
                    for (String line : lines) {
                        content.showText(line);
                        content.newLineAtOffset(0, -20);
                    }
                    content.endText();
                }
            }
            document.save(file.toFile());
        }
        return file;
    }
}

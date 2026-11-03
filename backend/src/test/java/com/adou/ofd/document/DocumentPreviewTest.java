package com.adou.ofd.document;

import com.adou.ofd.web.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentPreviewTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private DocumentService documents;

    @BeforeEach
    void setUp() {
        documents = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.8.0"));
    }

    @AfterEach
    void tearDown() {
        documents.closeAll();
    }

    @Test
    void previewsOfdWithoutReplacingViewerSession() throws IOException {
        DocumentSummary viewer = documents.openDemo();
        DocumentSummary preview = documents.openPreview(viewer.path());

        assertNotEquals(viewer.id(), preview.id());
        Path png = documents.renderPreview(preview.id(), 1, 24);
        assertTrue(Files.isRegularFile(png));
        assertTrue(Files.size(png) > 0);

        documents.closePreview(preview.id());
        assertCode("PREVIEW_NOT_FOUND", () -> documents.renderPreview(preview.id(), 1, 24));

        Path viewerPng = documents.render(viewer.id(), 1, 24);
        assertTrue(Files.size(viewerPng) > 0, "关闭预览不应影响阅读器会话");
    }

    @Test
    void previewsPdfAndRejectsOutOfRangePage() throws IOException {
        DocumentSummary pdf = documents.openPdfDemo();
        DocumentSummary preview = documents.openPreview(pdf.path());

        assertTrue(Files.size(documents.renderPreview(preview.id(), 1, 24)) > 0);
        assertCode("PAGE_OUT_OF_RANGE",
                () -> documents.renderPreview(preview.id(), preview.pageCount() + 1, 24));
        documents.closePreview(preview.id());
    }

    private void assertCode(String code, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(code, error.getCode(), error.getMessage());
    }
}

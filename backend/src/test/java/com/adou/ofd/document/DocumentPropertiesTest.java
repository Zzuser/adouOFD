package com.adou.ofd.document;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentPropertiesTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private DocumentService documents;

    @BeforeEach
    void setUp() {
        documents = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.9.0"));
    }

    @AfterEach
    void tearDown() {
        documents.closeAll();
    }

    @Test
    void pdfPropertiesIncludeMetadata() {
        DocumentSummary pdf = documents.openPdfDemo();
        DocumentProperties properties = documents.properties(pdf.id());

        assertEquals(pdf.id(), properties.summary().id());
        assertEquals("阿豆OFD", properties.metadata().get("author"));
        assertEquals("阿豆OFD", properties.metadata().get("creator"));
        assertNotNull(properties.metadata().get("title"));
        assertNotNull(properties.metadata().get("pdfVersion"));
        assertTrue(properties.signatures().isEmpty(), "示例 PDF 不应包含签名");
    }

    @Test
    void ofdPropertiesIncludeOfdVersion() {
        DocumentSummary ofd = documents.openDemo();
        DocumentProperties properties = documents.properties(ofd.id());

        assertEquals("OFD", properties.summary().kind());
        assertFalse(properties.metadata().isEmpty());
        assertNotNull(properties.metadata().get("ofdVersion"));
        assertTrue(properties.signatures().isEmpty(), "示例 OFD 不应包含签名");
    }
}

package com.adou.ofd.document;

import com.adou.ofd.web.ApiException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EncryptedPdfTest {

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
    void requiresAndAcceptsPdfPassword() throws Exception {
        Path dir = Files.createTempDirectory("adou-encrypted-");
        Path pdf = dir.resolve("encrypted.pdf");
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            AccessPermission permission = new AccessPermission();
            StandardProtectionPolicy policy = new StandardProtectionPolicy(
                    "owner-password", "user-password", permission);
            policy.setEncryptionKeyLength(128);
            document.protect(policy);
            document.save(pdf.toFile());
        }

        ApiException required = assertThrows(ApiException.class, () -> documents.open(pdf.toString()));
        assertEquals("PDF_PASSWORD_REQUIRED", required.getCode());

        ApiException invalid = assertThrows(ApiException.class,
                () -> documents.open(pdf.toString(), "wrong-password"));
        assertEquals("PDF_PASSWORD_INVALID", invalid.getCode());

        DocumentSummary opened = documents.open(pdf.toString(), "user-password");
        assertEquals(1, opened.pageCount());
        assertEquals("PDF", opened.kind());
    }
}

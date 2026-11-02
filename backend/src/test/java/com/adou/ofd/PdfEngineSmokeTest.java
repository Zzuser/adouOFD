package com.adou.ofd.document;

import com.adou.ofd.web.ApiException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PdfEngineSmokeTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    @Test
    void pdfDemoOpensRendersAndProducesThumbnail() throws Exception {
        Path artifacts = Files.createTempDirectory("adou-pdf-smoke-");
        PdfDemoFactory pdfDemoFactory = new PdfDemoFactory("0.7.0");
        DocumentService service = new DocumentService(new DemoOfdFactory(), pdfDemoFactory);
        try {
            Path pdf = pdfDemoFactory.generate(artifacts);
            DocumentSummary summary = service.open(pdf.toString());

            assertEquals("PDF", summary.kind());
            assertEquals(3, summary.pageCount());
            assertFalse(summary.signed());
            assertTrue(summary.pages().getFirst().widthMm() > 190, "A4 宽度应约为 210mm");
            assertTrue(summary.pages().getFirst().heightMm() > 280, "A4 高度应约为 297mm");

            var outline = service.outline(summary.id());
            assertFalse(outline.isEmpty(), "PDF 示例应包含目录");
            assertTrue(outline.stream().anyMatch((item) -> item.level() == 2 && item.page() != null),
                    "目录应包含二级条目且能解析页码");

            var textRuns = service.pageText(summary.id(), 1);
            assertFalse(textRuns.isEmpty(), "PDF 第 1 页应能提取文本");
            String pageText = String.join("", textRuns.stream().map((run) -> run.text()).toList());
            assertTrue(pageText.contains("ADou") || pageText.contains("PDF"),
                    "PDF 文本应包含标题文字");
            assertTrue(textRuns.size() > 50, "PDF 文字层应按字形拆分");
            assertTrue(textRuns.stream().allMatch((run) ->
                            run.x() >= 0 && run.x() <= 1 && run.y() >= 0 && run.y() <= 1
                                    && run.width() > 0 && run.height() > 0),
                    "文本坐标应归一化在页面范围内");

            Path png = service.render(summary.id(), 1, 96);
            BufferedImage image = ImageIO.read(png.toFile());
            assertNotNull(image, "PDF 渲染结果应为合法 PNG");
            assertTrue(image.getWidth() > 700, "96 DPI 下 A4 页面宽度应大于 700px");
            assertTrue(hasInk(image), "PDF 页面应包含可见内容");

            Path thumbnail = service.render(summary.id(), 2, 24);
            BufferedImage thumbImage = ImageIO.read(thumbnail.toFile());
            assertNotNull(thumbImage, "PDF 缩略图应为合法 PNG");
            assertTrue(thumbImage.getWidth() > 100 && thumbImage.getWidth() < 400,
                    "24 DPI 缩略图宽度应在 100-400px 之间");
        } finally {
            service.closeAll();
        }
    }

    @Test
    void rotatedPdfTextLayerUsesDisplayCoordinates() throws Exception {
        Path dir = Files.createTempDirectory("adou-pdf-rotated-");
        Path pdf = dir.resolve("rotated.pdf");
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            page.setRotation(90);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 18);
                content.newLineAtOffset(100, 100);
                content.showText("ROTATED TEXT");
                content.endText();
            }
            document.save(pdf.toFile());
        }

        DocumentService service = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.7.0"));
        try {
            DocumentSummary summary = service.open(pdf.toString());
            assertEquals(297.0, summary.pages().getFirst().widthMm(), 1.0,
                    "旋转 90 度后页面宽高应交换");
            var textRuns = service.pageText(summary.id(), 1);
            String rotatedText = String.join("", textRuns.stream().map((item) -> item.text()).toList());
            assertTrue(rotatedText.contains("ROTATED"), "旋转页面文字应可提取");
            var glyph = textRuns.stream()
                    .filter((item) -> item.text().startsWith("R"))
                    .findFirst()
                    .orElseThrow();
            assertTrue(glyph.height() > glyph.width(), "旋转 90 度的字形框应为竖长条");
        } finally {
            service.closeAll();
        }
    }

    @Test
    void encryptedPdfIsRejectedWithFriendlyCode() throws Exception {
        Path dir = Files.createTempDirectory("adou-pdf-encrypted-");
        Path encrypted = dir.resolve("encrypted.pdf");
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.A4));
            StandardProtectionPolicy policy = new StandardProtectionPolicy(
                    "owner-password", "user-password", new AccessPermission());
            policy.setEncryptionKeyLength(128);
            document.protect(policy);
            document.save(encrypted.toFile());
        }

        DocumentService service = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.7.0"));
        try {
            ApiException error = assertThrows(ApiException.class, () -> service.open(encrypted.toString()));
            assertEquals("PDF_ENCRYPTED", error.getCode());
        } finally {
            service.closeAll();
        }
    }

    private boolean hasInk(BufferedImage image) {
        long ink = 0;
        for (int y = 0; y < image.getHeight(); y += 4) {
            for (int x = 0; x < image.getWidth(); x += 4) {
                int rgb = image.getRGB(x, y);
                int alpha = (rgb >>> 24) & 0xFF;
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;
                if (alpha > 0 && r + g + b < 600) {
                    ink++;
                }
            }
        }
        return ink > 100;
    }
}

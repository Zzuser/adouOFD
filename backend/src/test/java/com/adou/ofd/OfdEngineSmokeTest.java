package com.adou.ofd.document;

import org.junit.jupiter.api.Test;
import org.ofdrw.converter.export.PDFExporterPDFBox;
import org.ofdrw.converter.ofdconverter.PDFConverter;
import org.ofdrw.reader.OFDReader;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfdEngineSmokeTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    @Test
    void demoDocumentRendersAndRoundTripsThroughPdf() throws Exception {
        DocumentService service = new DocumentService(new DemoOfdFactory(), new PdfDemoFactory("0.7.0"));
        Path artifacts = Files.createTempDirectory("adou-smoke-");
        try {
            DocumentSummary demo = service.openDemo();
            assertEquals("OFD", demo.kind());
            assertTrue(demo.pageCount() >= 4, "示例文档应为多页，便于验证连续预览");
            assertTrue(demo.pages().getFirst().widthMm() > 190, "A4 宽度应约为 210mm");
            assertTrue(demo.pages().getFirst().heightMm() > 280, "A4 高度应约为 297mm");
            assertTrue(service.outline(demo.id()).isEmpty(), "OFD 示例没有目录时应返回空列表");
            var textRuns = service.pageText(demo.id(), 1);
            assertFalse(textRuns.isEmpty(), "OFD 第 1 页应能提取文本");
            String pageText = String.join("", textRuns.stream().map((run) -> run.text()).toList());
            assertTrue(pageText.contains("阿豆"), "OFD 文本应包含标题文字");
            assertTrue(textRuns.size() > 50, "OFD 文字层应按字形拆分");
            assertTrue(textRuns.stream().allMatch((run) ->
                            run.x() >= 0 && run.x() <= 1 && run.y() >= 0 && run.y() <= 1
                                    && run.width() > 0 && run.height() > 0),
                    "文本坐标应归一化在页面范围内");

            Path png = service.render(demo.id(), 1, 96);
            BufferedImage image = ImageIO.read(png.toFile());
            assertNotNull(image, "渲染结果应为合法 PNG");
            assertTrue(image.getWidth() > 700, "96 DPI 下 A4 页面宽度应大于 700px");
            assertTrue(hasInk(image), "页面应包含可见内容");

            Path thumbnail = service.render(demo.id(), 2, 24);
            BufferedImage thumbImage = ImageIO.read(thumbnail.toFile());
            assertNotNull(thumbImage, "缩略图应为合法 PNG");
            assertTrue(thumbImage.getWidth() > 100 && thumbImage.getWidth() < 400,
                    "24 DPI 缩略图宽度应在 100-400px 之间");

            Path pdf = artifacts.resolve("demo.pdf");
            try (PDFExporterPDFBox exporter = new PDFExporterPDFBox(Path.of(demo.path()), pdf)) {
                exporter.export();
            }
            assertTrue(Files.size(pdf) > 1000, "PDF 导出结果不应为空");

            Path roundTrip = artifacts.resolve("demo-roundtrip.ofd");
            try (PDFConverter converter = new PDFConverter(roundTrip)) {
                converter.convert(pdf);
            }
            try (OFDReader reader = new OFDReader(roundTrip)) {
                assertEquals(demo.pageCount(), reader.getNumberOfPages(), "PDF 转 OFD 后页数应保持一致");
            }
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

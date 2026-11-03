package com.adou.ofd.document;

import com.adou.ofd.web.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentRotationTest {

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
    void rotatesOfdPageInQuarterTurns() throws Exception {
        DocumentSummary demo = documents.openDemo();
        BufferedImage base = read(documents.render(demo.id(), 1, 96));
        BufferedImage right = read(documents.render(demo.id(), 1, 96, 90));
        BufferedImage half = read(documents.render(demo.id(), 1, 96, 180));
        BufferedImage left = read(documents.render(demo.id(), 1, 96, 270));

        assertEquals(base.getHeight(), right.getWidth(), "顺时针 90° 后宽高应交换");
        assertEquals(base.getWidth(), right.getHeight(), "顺时针 90° 后宽高应交换");
        assertEquals(base.getWidth(), half.getWidth(), "180° 不应改变宽高");
        assertEquals(base.getHeight(), half.getHeight(), "180° 不应改变宽高");
        assertEquals(right.getWidth(), left.getWidth(), "270° 的宽高应与 90° 一致");
        assertEquals(right.getHeight(), left.getHeight(), "270° 的宽高应与 90° 一致");
        assertTrue(hasInk(right), "旋转后页面仍应包含可见内容");
        assertTrue(hasInk(left), "270° 旋转后页面仍应包含可见内容");
    }

    @Test
    void rotatesPdfPageInQuarterTurns() throws Exception {
        DocumentSummary pdf = documents.openPdfDemo();
        BufferedImage base = read(documents.render(pdf.id(), 1, 96));
        BufferedImage right = read(documents.render(pdf.id(), 1, 96, 90));

        assertEquals(base.getHeight(), right.getWidth(), "PDF 旋转 90° 后宽高应交换");
        assertEquals(base.getWidth(), right.getHeight(), "PDF 旋转 90° 后宽高应交换");
        assertTrue(hasInk(right), "PDF 旋转后页面仍应包含可见内容");
    }

    @Test
    void rejectsNonQuarterRotation() {
        DocumentSummary demo = documents.openDemo();
        ApiException error = assertThrows(ApiException.class,
                () -> documents.render(demo.id(), 1, 96, 45));
        assertEquals("INVALID_ROTATION", error.getCode());
    }

    private BufferedImage read(Path path) throws Exception {
        BufferedImage image = ImageIO.read(path.toFile());
        assertNotNull(image, "渲染结果应为合法 PNG");
        return image;
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

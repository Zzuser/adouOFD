package com.adou.ofd.render;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.ofdrw.reader.OFDReader;

import java.awt.image.BufferedImage;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AntialiasedImageMakerTest {

    @TempDir
    Path tempDir;

    @Test
    void keepsSubPixelStrokesAsGrayCoverage() throws Exception {
        Path ofd = OfdFixtures.thinStrokes(tempDir);
        try (OFDReader reader = new OFDReader(ofd)) {
            BufferedImage image = new AntialiasedImageMaker(reader, 12).makePage(0);
            assertTrue(hasPartialCoverage(image), "细笔画应按灰度覆盖渲染，而不是只输出纯黑白");
            assertTrue(rowHasInk(image, 10), "0.05mm 横线在 12px/mm 下不足 1 像素，仍需留下可见灰度");
        }
    }

    private boolean hasPartialCoverage(BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int gray = image.getRGB(x, y) & 0xFF;
                if (gray > 0 && gray < 255) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean rowHasInk(BufferedImage image, double yMm) {
        int row = (int) Math.round(yMm * 12);
        for (int offset = -1; offset <= 1; offset++) {
            int y = row + offset;
            if (y < 0 || y >= image.getHeight()) {
                continue;
            }
            for (int x = 0; x < image.getWidth(); x++) {
                if ((image.getRGB(x, y) & 0xFF) < 200) {
                    return true;
                }
            }
        }
        return false;
    }
}

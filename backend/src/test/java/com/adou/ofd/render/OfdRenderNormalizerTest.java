package com.adou.ofd.render;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.ofdrw.core.basicStructure.pageObj.layer.CT_Layer;
import org.ofdrw.core.basicStructure.pageObj.layer.PageBlockType;
import org.ofdrw.core.basicStructure.pageObj.layer.block.CT_PageBlock;
import org.ofdrw.core.pageDescription.CT_GraphicUnit;
import org.ofdrw.core.pageDescription.clips.Area;
import org.ofdrw.core.pageDescription.clips.CT_Clip;
import org.ofdrw.core.pageDescription.clips.Clips;
import org.ofdrw.converter.ImageMaker;
import org.ofdrw.converter.PdfboxMaker;
import org.ofdrw.reader.OFDReader;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 用最小 OFD 验证两个渲染后端对 Boundary 的差异：
 * ImageMaker 需要补裁剪区平移，PdfboxMaker 不能补（否则二次偏移）。
 */
class OfdRenderNormalizerTest {

    @TempDir
    Path tempDir;

    @Test
    void imageRendererDropsContentWhenClipIsNotNormalized() throws Exception {
        Path ofd = OfdFixtures.clipBoundary(tempDir);
        try (OFDReader reader = new OFDReader(ofd)) {
            BufferedImage image = new ImageMaker(reader, 4).makePage(0);
            assertEquals(0, darkPixels(image), "未归一化时裁剪区被画到页面左上角，内容应被裁掉");
        }
    }

    @Test
    void imageBackendRestoresClippedContent() throws Exception {
        Path ofd = OfdFixtures.clipBoundary(tempDir);
        try (OFDReader reader = new OFDReader(ofd)) {
            OfdRenderNormalizer.normalize(reader, OfdRenderNormalizer.Backend.IMAGE);
            BufferedImage image = new ImageMaker(reader, 4).makePage(0);
            assertTrue(darkPixels(image) > 0, "归一化后内容应恢复");
        }
    }

    @Test
    void pdfBackendLeavesClipsToItsOwnBoundaryHandling() throws Exception {
        Path ofd = OfdFixtures.clipBoundary(tempDir);
        try (OFDReader reader = new OFDReader(ofd)) {
            OfdRenderNormalizer.normalize(reader, OfdRenderNormalizer.Backend.PDF);
            for (Area area : clipAreas(reader)) {
                assertNull(area.getCTM(), "PDF 后端已按裁剪区 Boundary 平移，不能再补 CTM");
            }
        }
    }

    @Test
    void pdfBackendRendersClippedContent() throws Exception {
        Path ofd = OfdFixtures.clipBoundary(tempDir);
        Path pdf = tempDir.resolve("out.pdf");
        try (OFDReader reader = new OFDReader(ofd);
             PDDocument document = new PDDocument()) {
            OfdRenderNormalizer.normalize(reader, OfdRenderNormalizer.Backend.PDF);
            new PdfboxMaker(reader, document).makePage(reader.getPageList().get(0));
            document.save(pdf.toFile());
        }
        try (PDDocument document = Loader.loadPDF(pdf.toFile())) {
            BufferedImage image = new PDFRenderer(document).renderImageWithDPI(0, 144);
            assertTrue(darkPixels(image) > 0, "矢量导出应保留裁剪区内的内容");
        }
        assertTrue(Files.size(pdf) > 0);
    }

    private int darkPixels(BufferedImage image) {
        int count = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int alpha = (rgb >>> 24) & 0xFF;
                int gray = ((rgb >> 16) & 0xFF) * 30 + ((rgb >> 8) & 0xFF) * 59 + (rgb & 0xFF) * 11;
                if (alpha > 0 && gray / 100 < 128) {
                    count++;
                }
            }
        }
        return count;
    }

    private List<Area> clipAreas(OFDReader reader) {
        List<Area> areas = new ArrayList<>();
        for (var page : reader.getPageList()) {
            for (CT_Layer layer : page.getAllLayer()) {
                collect(layer, areas);
            }
        }
        return areas;
    }

    private void collect(CT_PageBlock block, List<Area> areas) {
        for (PageBlockType child : block.getPageBlocks()) {
            if (child instanceof CT_PageBlock nested) {
                collect(nested, areas);
            }
            if (child instanceof CT_GraphicUnit<?> unit) {
                Clips clips = unit.getClips();
                if (clips == null) {
                    continue;
                }
                for (CT_Clip clip : clips.getClips()) {
                    areas.addAll(clip.getAreas());
                }
            }
        }
    }

}

package com.adou.ofd;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.ofdrw.font.Font;
import org.ofdrw.font.FontName;
import org.ofdrw.layout.OFDDoc;
import org.ofdrw.layout.PageLayout;
import org.ofdrw.layout.element.Paragraph;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;

/**
 * 压力测试夹具生成器（仅用于本地压测，不随应用发布）。
 * 运行：
 *   java -cp target/classes;target/test-classes;<deps> com.adou.ofd.StressFixtureGenerator [输出目录]
 */
public final class StressFixtureGenerator {

    private StressFixtureGenerator() {
    }

    public static void main(String[] args) throws Exception {
        Path outDir = Path.of(args.length > 0 ? args[0] : ".tools/stress");
        Files.createDirectories(outDir);
        System.out.println("输出目录: " + outDir.toAbsolutePath());

        Path vectorPdf = outDir.resolve("stress-vector-800p.pdf");
        generateVectorPdf(vectorPdf, 800);
        printSize(vectorPdf);

        Path imagePdf = outDir.resolve("stress-images-100p.pdf");
        generateImagePdf(imagePdf, 100, 3000, 2000);
        printSize(imagePdf);

        Path ofd = outDir.resolve("stress-ofd-large.ofd");
        generateOfd(ofd, 3800);
        printSize(ofd);
    }

    private static void generateVectorPdf(Path target, int pageCount) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDDocumentOutline outline = new PDDocumentOutline();
            PDOutlineItem currentSection = null;
            for (int index = 0; index < pageCount; index++) {
                int pageNo = index + 1;
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.setNonStrokingColor(new Color(47, 122, 79));
                    content.addRect(0, 790, 595, 52);
                    content.fill();

                    content.beginText();
                    content.setNonStrokingColor(Color.WHITE);
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 18);
                    content.newLineAtOffset(48, 812);
                    content.showText("ADou OFD Stress PDF");
                    content.endText();

                    content.beginText();
                    content.setNonStrokingColor(new Color(40, 48, 42));
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                    content.newLineAtOffset(48, 750);
                    content.showText("Page " + pageNo + " / " + pageCount);
                    content.endText();

                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 9);
                    content.newLineAtOffset(48, 715);
                    for (int line = 0; line < 34; line++) {
                        content.showText("The quick brown fox jumps over the lazy dog. "
                                + "Stress fixture line " + (line + 1)
                                + " for continuous rendering and navigation testing.");
                        content.newLineAtOffset(0, -18);
                    }
                    content.endText();

                    for (int block = 0; block < 6; block++) {
                        content.setNonStrokingColor((block % 3 == 0) ? 228 : 236, 181, 75);
                        content.addRect(48 + block * 84, 58, 70, 16);
                        content.fill();
                    }
                }

                if (pageNo % 50 == 1) {
                    currentSection = new PDOutlineItem();
                    currentSection.setTitle("Section " + ((pageNo - 1) / 50 + 1) + " · Page " + pageNo);
                    currentSection.setDestination(page);
                    outline.addLast(currentSection);
                }
                if (pageNo % 10 == 1 && currentSection != null) {
                    PDOutlineItem child = new PDOutlineItem();
                    child.setTitle("Page " + pageNo);
                    child.setDestination(page);
                    currentSection.addLast(child);
                }
            }
            document.getDocumentCatalog().setDocumentOutline(outline);
            document.save(target.toFile());
        }
    }

    private static void generateImagePdf(Path target, int pageCount, int width, int height) throws IOException {
        Random random = new Random(20261030L);
        try (PDDocument document = new PDDocument()) {
            for (int index = 0; index < pageCount; index++) {
                int pageNo = index + 1;
                BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
                Graphics2D graphics = image.createGraphics();
                try {
                    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                    graphics.setPaint(new GradientPaint(0, 0, new Color(30 + index * 5 % 200, 90, 60),
                            width, height, new Color(20, 60, 140)));
                    graphics.fillRect(0, 0, width, height);
                    for (int shape = 0; shape < 140; shape++) {
                        graphics.setColor(new Color(random.nextInt(256), random.nextInt(256),
                                random.nextInt(256), 110));
                        int size = 40 + random.nextInt(380);
                        graphics.fillOval(random.nextInt(width), random.nextInt(height), size, size);
                    }
                    graphics.setColor(Color.WHITE);
                    graphics.setFont(graphics.getFont().deriveFont(72f));
                    graphics.drawString("Stress Image Page " + pageNo, 80, 160);
                } finally {
                    graphics.dispose();
                }

                ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
                ImageIO.write(image, "jpg", jpeg);
                PDImageXObject imageObject = JPEGFactory.createFromStream(
                        document, new ByteArrayInputStream(jpeg.toByteArray()));

                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.drawImage(imageObject, 0, 0, PDRectangle.A4.getWidth(), PDRectangle.A4.getHeight());
                    content.setNonStrokingColor(0, 0, 0, 150);
                    content.addRect(0, 0, PDRectangle.A4.getWidth(), 54);
                    content.fill();
                    content.beginText();
                    content.setNonStrokingColor(Color.WHITE);
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 16);
                    content.newLineAtOffset(28, 22);
                    content.showText("Page " + pageNo + " / " + pageCount + " · large embedded image");
                    content.endText();
                }
            }
            document.save(target.toFile());
        }
    }

    private static void generateOfd(Path target, int lines) throws IOException {
        Font font;
        try {
            font = FontName.MSYahei.font();
        } catch (RuntimeException ex) {
            font = Font.getDefault();
        }
        try (OFDDoc doc = new OFDDoc(target)) {
            doc.setDefaultPageLayout(PageLayout.A4().setMargin(18d));
            doc.add(new Paragraph("阿豆OFD 压力测试文档", 9d, font));
            for (int index = 1; index <= lines; index++) {
                if (index % 40 == 1) {
                    doc.add(new Paragraph("— 第 " + ((index - 1) / 40 + 1) + " 节 —", 5d, font));
                }
                doc.add(new Paragraph(
                        String.format("%05d  OFD stress line: 连续滚动、缩略图、缩放、页码跳转、目录渲染压力测试。", index),
                        3.4d,
                        font).setLineSpace(1.5d));
            }
        }
    }

    private static void printSize(Path file) throws IOException {
        System.out.printf("%s  %.1f MB  %d pages-source-lines%n",
                file.getFileName(), Files.size(file) / 1024.0 / 1024.0,
                file.toString().contains("ofd") ? 3800 : 0);
    }
}

package com.adou.ofd.document;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class PdfDemoFactory {

    private final String appVersion;

    public PdfDemoFactory(@Value("${adou.version:0.5.2}") String appVersion) {
        this.appVersion = appVersion;
    }

    public Path generate(Path dir) throws IOException {
        Path target = dir.resolve("阿豆OFD-PDF示例.pdf");
        try (PDDocument document = new PDDocument()) {
            PDFont chinese = loadChineseFont(document);
            boolean useChinese = chinese != null;
            PDFont regular = useChinese ? chinese : PDType1Font.HELVETICA;
            PDFont bold = useChinese ? chinese : PDType1Font.HELVETICA_BOLD;

            for (int pageNo = 1; pageNo <= 3; pageNo++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                writePage(document, page, regular, bold, useChinese, pageNo);
            }
            addOutline(document, useChinese);
            document.save(target.toFile());
        }
        return target;
    }

    private void addOutline(PDDocument document, boolean useChinese) {
        PDDocumentOutline outline = new PDDocumentOutline();

        PDOutlineItem first = new PDOutlineItem();
        first.setTitle(useChinese ? "第 1 页 · 示例说明" : "Page 1 - Overview");
        first.setDestination(document.getPage(0));
        outline.addLast(first);

        PDOutlineItem features = new PDOutlineItem();
        features.setTitle(useChinese ? "第 2 页 · 功能概览" : "Page 2 - Features");
        features.setDestination(document.getPage(1));
        String[] children = useChinese
                ? new String[]{"连续滚动", "缩略图导航", "缩放与页码"}
                : new String[]{"Continuous scroll", "Thumbnails", "Zoom and page jumps"};
        for (String childTitle : children) {
            PDOutlineItem child = new PDOutlineItem();
            child.setTitle(childTitle);
            child.setDestination(document.getPage(1));
            features.addLast(child);
        }
        outline.addLast(features);

        PDOutlineItem last = new PDOutlineItem();
        last.setTitle(useChinese ? "第 3 页 · 结尾" : "Page 3 - Closing");
        last.setDestination(document.getPage(2));
        outline.addLast(last);

        document.getDocumentCatalog().setDocumentOutline(outline);
    }

    private void writePage(PDDocument document, PDPage page, PDFont regular, PDFont bold,
                           boolean useChinese, int pageNo) throws IOException {
        float width = page.getMediaBox().getWidth();
        float height = page.getMediaBox().getHeight();

        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.setNonStrokingColor(47, 122, 79);
            content.addRect(0, height - 104, width, 104);
            content.fill();

            content.beginText();
            content.setNonStrokingColor(255, 255, 255);
            content.setFont(bold, 25);
            content.newLineAtOffset(56, height - 62);
            content.showText(useChinese ? "阿豆 OFD · PDF 预览示例" : "ADou OFD - PDF Preview");
            content.endText();

            content.beginText();
            content.setNonStrokingColor(228, 240, 231);
            content.setFont(regular, 11);
            content.newLineAtOffset(56, height - 86);
            content.showText(useChinese
                    ? "本地渲染 · 不联网 · 不上传"
                    : "Local rendering - offline - private");
            content.endText();

            content.beginText();
            content.setNonStrokingColor(23, 37, 28);
            content.setFont(bold, 18);
            content.newLineAtOffset(56, height - 150);
            content.showText(useChinese ? "第 " + pageNo + " 页 / 共 3 页" : "Page " + pageNo + " of 3");
            content.endText();

            String[] lines = useChinese
                    ? new String[]{
                        "这是一份由 PDFBox 在本机生成的 PDF 示例文档。",
                        "阿豆OFD 支持连续滚动、缩略图导航、缩放与页码跳转。",
                        "PDF 页面按需渲染为图片，原文件不会被修改。",
                        "你可以尝试缩放工具栏、Ctrl+滚轮，或点击左侧缩略图。",
                        "当前示例用于验证 PDF 打开、渲染与预览链路。"
                    }
                    : new String[]{
                        "This PDF sample is generated locally by PDFBox.",
                        "ADou OFD supports continuous scrolling, thumbnails, zoom and page jumps.",
                        "Pages are rendered on demand; the original file is never modified.",
                        "Try the zoom dock, Ctrl+wheel, or click a thumbnail.",
                        "This sample validates PDF opening, rendering and preview."
                    };

            content.beginText();
            content.setNonStrokingColor(58, 72, 62);
            content.setFont(regular, 11.5f);
            content.newLineAtOffset(56, height - 192);
            for (String line : lines) {
                content.showText(line);
                content.newLineAtOffset(0, -23);
            }
            content.endText();

            int[][] colors = {{47, 122, 79}, {228, 181, 75}, {180, 71, 47}};
            String[] labels = useChinese
                    ? new String[]{"连续滚动", "缩略图", "缩放"}
                    : new String[]{"Scroll", "Thumbnails", "Zoom"};
            for (int index = 0; index < colors.length; index++) {
                float cardX = 56 + index * 162;
                content.setNonStrokingColor(colors[index][0], colors[index][1], colors[index][2]);
                content.addRect(cardX, height - 380, 146, 86);
                content.fill();

                content.beginText();
                content.setNonStrokingColor(255, 255, 255);
                content.setFont(bold, 14);
                content.newLineAtOffset(cardX + 18, height - 338);
                content.showText(labels[index]);
                content.endText();
            }

            content.setNonStrokingColor(215, 210, 198);
            content.addRect(56, 74, width - 112, 1);
            content.fill();

            content.beginText();
            content.setNonStrokingColor(130, 140, 130);
            content.setFont(regular, 9);
            content.newLineAtOffset(56, 50);
            content.showText("ADou OFD " + appVersion + " - PDF preview sample");
            content.endText();
        }
    }

    private PDFont loadChineseFont(PDDocument document) {
        String windowsDir = System.getenv("WINDIR");
        if (windowsDir == null || windowsDir.isBlank()) {
            return null;
        }
        Path fontFile = Path.of(windowsDir, "Fonts", "simhei.ttf");
        if (!Files.isRegularFile(fontFile)) {
            return null;
        }
        try (InputStream input = Files.newInputStream(fontFile)) {
            return PDType0Font.load(document, input, true);
        } catch (IOException ex) {
            return null;
        }
    }
}

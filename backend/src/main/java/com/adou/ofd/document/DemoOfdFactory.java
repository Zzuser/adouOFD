package com.adou.ofd.document;

import org.ofdrw.font.Font;
import org.ofdrw.font.FontName;
import org.ofdrw.layout.OFDDoc;
import org.ofdrw.layout.PageLayout;
import org.ofdrw.layout.element.Paragraph;
import org.ofdrw.layout.element.TextAlign;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Path;

@Component
public class DemoOfdFactory {

    public Path generate(Path dir) throws IOException {
        Path target = dir.resolve("阿豆OFD-示例文档.ofd");
        Font bodyFont = resolveFont();

        try (OFDDoc doc = new OFDDoc(target)) {
            doc.setDefaultPageLayout(PageLayout.A4().setMargin(20d));

            doc.add(new Paragraph("阿豆 OFD", 9d, bodyFont)
                    .setTextAlign(TextAlign.center));
            doc.add(new Paragraph("免费 · 离线 · 本地处理", 4.2d, bodyFont)
                    .setTextAlign(TextAlign.center));
            doc.add(new Paragraph(" ", 3d, bodyFont));

            for (int i = 1; i <= 150; i++) {
                String line = String.format(
                        "%02d  阿豆OFD 支持 OFD 查看、PDF 与 OFD 互转、文档合并与拆分，所有处理均在本机完成。",
                        i);
                doc.add(new Paragraph(line, 3.4d, bodyFont).setLineSpace(1.55d));
            }

            doc.add(new Paragraph(" ", 3d, bodyFont));
            doc.add(new Paragraph("本示例由 ofdrw 2.5.1 在本机动态生成，仅用于功能演示。", 3.2d, bodyFont)
                    .setTextAlign(TextAlign.center));
        }
        return target;
    }

    private Font resolveFont() {
        try {
            return FontName.MSYahei.font();
        } catch (RuntimeException ex) {
            return Font.getDefault();
        }
    }
}

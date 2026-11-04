package com.adou.ofd.convert;

import com.adou.ofd.document.DemoOfdFactory;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.ofdrw.reader.OFDReader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.format.DateTimeParseException;
import java.util.Collections;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConversionEngineAttachmentTest {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    @TempDir
    Path tempDir;

    @Test
    void convertsOfdWithNonIsoAttachmentDate() throws Exception {
        Path demo = new DemoOfdFactory().generate(tempDir);
        Path source = addAttachmentWithDate(demo, "2026-5-11 11:50:30");
        int pages;
        try (OFDReader reader = new OFDReader(source)) {
            pages = reader.getNumberOfPages();
            assertEquals(1, reader.getAttachmentList().size(), "测试夹具应包含一个附件");
            assertThrows(DateTimeParseException.class,
                    () -> reader.getAttachmentList().get(0).getCreationDateTime(),
                    "非 ISO 日期应能触发 ofdrw 的解析异常");
        }

        Path output = tempDir.resolve("attachment.pdf");
        ConversionEngine.ExportMode mode = new ConversionEngine().ofdToPdf(
                source, output, new ConversionEngine.Progress() {
                    @Override
                    public void update(int percent, String phase) {
                    }

                    @Override
                    public boolean canceled() {
                        return false;
                    }
                });

        assertTrue(Files.size(output) > 1000, "附件日期异常不应导致正文转换失败");
        try (PDDocument document = Loader.loadPDF(output.toFile())) {
            assertEquals(pages, document.getNumberOfPages());
        }
        assertEquals(ConversionEngine.ExportMode.VECTOR, mode);
    }

    private Path addAttachmentWithDate(Path source, String date) throws IOException {
        Path target = tempDir.resolve("with-attachment.ofd");
        String attachments = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<ofd:Attachments xmlns:ofd=\"http://www.ofdspec.org/2016\">"
                + "<ofd:Attachment ID=\"1\" Name=\"test.xml\" Format=\"xml\" Size=\"4\""
                + " CreationDate=\"" + date + "\">"
                + "<ofd:FileLoc>test.xml</ofd:FileLoc>"
                + "</ofd:Attachment></ofd:Attachments>";
        try (ZipFile zip = new ZipFile(source.toFile(), StandardCharsets.UTF_8);
             ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(target), StandardCharsets.UTF_8)) {
            for (ZipEntry entry : Collections.list(zip.entries())) {
                out.putNextEntry(new ZipEntry(entry.getName()));
                if (entry.getName().endsWith("Document.xml")) {
                    String document = new String(zip.getInputStream(entry).readAllBytes(), StandardCharsets.UTF_8);
                    document = document.replace("</ofd:Document>",
                            "<ofd:Attachments>Attachs/Attachments.xml</ofd:Attachments></ofd:Document>");
                    out.write(document.getBytes(StandardCharsets.UTF_8));
                } else {
                    zip.getInputStream(entry).transferTo(out);
                }
                out.closeEntry();
            }
            put(out, "Doc_0/Attachs/Attachments.xml", attachments);
            put(out, "Doc_0/Attachs/test.xml", "<a/>");
        }
        return target;
    }

    private void put(ZipOutputStream out, String name, String content) throws IOException {
        out.putNextEntry(new ZipEntry(name));
        out.write(content.getBytes(StandardCharsets.UTF_8));
        out.closeEntry();
    }
}

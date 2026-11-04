package com.adou.ofd.merge;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfdStyleRepairTest {

    private Path workDir;

    @BeforeEach
    void setUp() throws IOException {
        workDir = Files.createTempDirectory("ofd-style-test-");
    }

    @Test
    void inlinesDrawParamAndDropsUnknownColorSpace() throws Exception {
        Path ofd = writeOfd();
        OfdStyleRepair repair = new OfdStyleRepair();

        OfdStyleRepair.StyleRepairResult result = repair.repair(ofd);

        assertEquals(1, result.inlined());
        assertEquals(1, result.colorSpaces());
        Document publicRes = readXml(ofd, "Doc_0/PublicRes.xml");
        Element drawParam = byId(publicRes, "DrawParam", "4");
        assertNotNull(drawParam);
        assertFalse(drawParam.hasAttribute("Relative"));
        assertEquals("0.25", drawParam.getAttribute("LineWidth"));
        Element stroke = child(drawParam, "StrokeColor");
        assertNotNull(stroke);
        assertEquals("128 0 0", stroke.getAttribute("Value"));
        assertNotNull(child(drawParam, "FillColor"));

        Document template = readXml(ofd, "Doc_0/Tpls/Tpl_0/Content.xml");
        Element strokeColor = firstByLocalName(template, "StrokeColor");
        assertNotNull(strokeColor);
        assertFalse(strokeColor.hasAttribute("ColorSpace"));
        assertEquals(0, repair.repair(ofd).changes(), "重复修复应无变化");
    }

    @Test
    void repairsReadOnlyOfdCopy() throws Exception {
        Path ofd = writeOfd();
        assertTrue(ofd.toFile().setReadOnly());
        assertFalse(Files.isWritable(ofd), "测试前置：副本应为只读");
        try {
            OfdStyleRepair.StyleRepairResult result = new OfdStyleRepair().repair(ofd);
            assertEquals(2, result.changes());
            assertTrue(Files.isWritable(ofd), "修复后工作副本应恢复可写");
        } finally {
            ofd.toFile().setWritable(true);
        }
    }

    private Path writeOfd() throws IOException {
        Path file = workDir.resolve("style.ofd");
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(file))) {
            put(out, "OFD.xml", "<ofd:OFD xmlns:ofd=\"http://www.ofdspec.org/2016\"/>");
            put(out, "Doc_0/PublicRes.xml",
                    "<ofd:Res xmlns:ofd=\"http://www.ofdspec.org/2016\"><ofd:DrawParams>"
                            + "<ofd:DrawParam ID=\"3\" LineWidth=\"0.25\">"
                            + "<ofd:StrokeColor Value=\"128 0 0\"/></ofd:DrawParam>"
                            + "<ofd:DrawParam ID=\"4\" Relative=\"3\">"
                            + "<ofd:FillColor Value=\"128 0 0\"/></ofd:DrawParam>"
                            + "</ofd:DrawParams></ofd:Res>");
            put(out, "Doc_0/Tpls/Tpl_0/Content.xml",
                    "<ofd:Page xmlns:ofd=\"http://www.ofdspec.org/2016\"><ofd:Content>"
                            + "<ofd:Layer DrawParam=\"4\"><ofd:PathObject ID=\"10\" Stroke=\"true\">"
                            + "<ofd:StrokeColor Value=\"118 89 84\" ColorSpace=\"999\"/>"
                            + "</ofd:PathObject></ofd:Layer></ofd:Content></ofd:Page>");
        }
        return file;
    }

    private Document readXml(Path ofd, String name) throws Exception {
        try (ZipFile zip = new ZipFile(ofd.toFile())) {
            byte[] bytes = zip.getInputStream(zip.getEntry(name)).readAllBytes();
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(false);
            return factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
        }
    }

    private Element byId(Document document, String localName, String id) {
        NodeList nodes = document.getElementsByTagName("*");
        for (int index = 0; index < nodes.getLength(); index++) {
            Node node = nodes.item(index);
            if (node instanceof Element element
                    && element.getTagName().endsWith(":" + localName)
                    && id.equals(element.getAttribute("ID"))) {
                return element;
            }
        }
        return null;
    }

    private Element firstByLocalName(Document document, String localName) {
        NodeList nodes = document.getElementsByTagName("*");
        for (int index = 0; index < nodes.getLength(); index++) {
            Node node = nodes.item(index);
            if (node instanceof Element element && element.getTagName().endsWith(":" + localName)) {
                return element;
            }
        }
        return null;
    }

    private Element child(Element parent, String localName) {
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element && element.getTagName().endsWith(":" + localName)) {
                return element;
            }
        }
        return null;
    }

    private void put(ZipOutputStream out, String name, String content) throws IOException {
        out.putNextEntry(new ZipEntry(name));
        out.write(content.getBytes(StandardCharsets.UTF_8));
        out.closeEntry();
    }
}

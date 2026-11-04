package com.adou.ofd.merge;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * ofdrw 的 OFDMerger 会保留 DrawParam 的 {@code Relative} 属性，却给被引用的
 * DrawParam 重新分配 ID。多个文档合并后，Relative 会指向另一个文档的同号样式，
 * 典型表现是发票表格框线变成白色/消失。
 *
 * <p>这里在合并前把每个 OFD 内的 DrawParam 继承链展开成自包含样式，并移除
 * 指向不存在 ColorSpace 的颜色空间引用，避免合并后样式串扰。
 */
public class OfdStyleRepair {

    private static final Logger log = LoggerFactory.getLogger(OfdStyleRepair.class);
    private static final Pattern DRAW_PARAM_DEF = Pattern.compile("<(?:\\w+:)?DrawParam\\b");
    private static final String RELATIVE = "Relative";
    private static final String ID = "ID";

    public record StyleRepairResult(int inlined, int colorSpaces) {
        public int changes() {
            return inlined + colorSpaces;
        }
    }

    public StyleRepairResult repair(Path ofd) throws IOException {
        Map<String, byte[]> replacements = new LinkedHashMap<>();
        int inlined = 0;
        int colorSpaces = 0;
        try (ZipFile zip = new ZipFile(ofd.toFile(), StandardCharsets.UTF_8)) {
            Map<String, Document> documents = new LinkedHashMap<>();
            Map<Document, String> names = new IdentityHashMap<>();
            Map<String, Element> drawParams = new HashMap<>();
            Set<String> colorSpaceIds = new HashSet<>();

            for (ZipEntry entry : Collections.list(zip.entries())) {
                String name = entry.getName();
                if (!name.toLowerCase(Locale.ROOT).endsWith(".xml")) {
                    continue;
                }
                String xml;
                try (InputStream in = zip.getInputStream(entry)) {
                    xml = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                }
                if (!DRAW_PARAM_DEF.matcher(xml).find() && !xml.contains("ColorSpace")) {
                    continue;
                }
                Document document = parse(xml);
                if (document == null) {
                    continue;
                }
                documents.put(name, document);
                names.put(document, name);
                collect(document, drawParams, colorSpaceIds);
            }

            Set<String> changed = new HashSet<>();
            Set<String> visiting = new HashSet<>();
            for (Element drawParam : drawParams.values()) {
                if (inline(drawParam, drawParams, visiting, changed, names)) {
                    inlined++;
                }
            }
            for (Document document : documents.values()) {
                colorSpaces += sanitizeColors(document, colorSpaceIds, names.get(document), changed);
            }
            for (String name : changed) {
                Document document = documents.get(name);
                if (document != null) {
                    replacements.put(name, serialize(document));
                }
            }
        }

        if (replacements.isEmpty()) {
            return new StyleRepairResult(0, 0);
        }
        rewrite(ofd, replacements);
        log.info("OFD 样式已展开: 继承 {} 处，清理无效颜色空间 {} 处", inlined, colorSpaces);
        return new StyleRepairResult(inlined, colorSpaces);
    }

    private void collect(Document document, Map<String, Element> drawParams, Set<String> colorSpaceIds) {
        NodeList all = document.getElementsByTagName("*");
        for (int index = 0; index < all.getLength(); index++) {
            Node node = all.item(index);
            if (!(node instanceof Element element)) {
                continue;
            }
            String local = localName(element);
            if ("DrawParam".equals(local) && !element.getAttribute(ID).isBlank()) {
                drawParams.put(element.getAttribute(ID), element);
            } else if ("ColorSpace".equals(local) && !element.getAttribute(ID).isBlank()) {
                colorSpaceIds.add(element.getAttribute(ID));
            }
        }
    }

    private boolean inline(Element drawParam, Map<String, Element> drawParams,
                           Set<String> visiting, Set<String> changed, Map<Document, String> names) {
        String relative = drawParam.getAttribute(RELATIVE);
        if (relative == null || relative.isBlank()) {
            return false;
        }
        String id = drawParam.getAttribute(ID);
        if (!visiting.add(id)) {
            drawParam.removeAttribute(RELATIVE);
            markChanged(drawParam, changed, names);
            return true;
        }
        try {
            Element parent = drawParams.get(relative);
            if (parent == null) {
                drawParam.removeAttribute(RELATIVE);
                markChanged(drawParam, changed, names);
                return true;
            }
            inline(parent, drawParams, visiting, changed, names);
            copyInherited(parent, drawParam);
            drawParam.removeAttribute(RELATIVE);
            markChanged(drawParam, changed, names);
            return true;
        } finally {
            visiting.remove(id);
        }
    }

    private void copyInherited(Element parent, Element child) {
        NamedNodeMap attributes = parent.getAttributes();
        for (int index = 0; index < attributes.getLength(); index++) {
            Node attribute = attributes.item(index);
            String name = attribute.getNodeName();
            if (ID.equals(name) || RELATIVE.equals(name) || child.hasAttribute(name)) {
                continue;
            }
            child.setAttribute(name, attribute.getNodeValue());
        }
        Set<String> childNames = new HashSet<>();
        for (Node node = child.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element) {
                childNames.add(localName(element));
            }
        }
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (!(node instanceof Element element)) {
                continue;
            }
            if (!childNames.contains(localName(element))) {
                child.appendChild(child.getOwnerDocument().importNode(element, true));
            }
        }
    }

    private int sanitizeColors(Document document, Set<String> colorSpaceIds,
                               String documentName, Set<String> changed) {
        int removed = 0;
        NodeList all = document.getElementsByTagName("*");
        for (int index = 0; index < all.getLength(); index++) {
            Node node = all.item(index);
            if (!(node instanceof Element element)) {
                continue;
            }
            String local = localName(element);
            if (!"StrokeColor".equals(local) && !"FillColor".equals(local)) {
                continue;
            }
            String colorSpace = element.getAttribute("ColorSpace");
            if (!colorSpace.isBlank() && !colorSpaceIds.contains(colorSpace)) {
                element.removeAttribute("ColorSpace");
                removed++;
                changed.add(documentName);
            }
        }
        return removed;
    }

    private void markChanged(Element element, Set<String> changed, Map<Document, String> names) {
        String name = names.get(element.getOwnerDocument());
        if (name != null) {
            changed.add(name);
        }
    }

    private String localName(Element element) {
        String name = element.getTagName();
        int index = name.indexOf(':');
        return index < 0 ? name : name.substring(index + 1);
    }

    private Document parse(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            trySetFeature(factory, "http://apache.org/xml/features/disallow-doctype-decl", true);
            trySetFeature(factory, "http://xml.org/sax/features/external-general-entities", false);
            trySetFeature(factory, "http://xml.org/sax/features/external-parameter-entities", false);
            trySetFeature(factory, XMLConstants.FEATURE_SECURE_PROCESSING, true);
            return factory.newDocumentBuilder()
                    .parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            log.debug("OFD XML 解析失败，跳过样式修复", ex);
            return null;
        }
    }

    private void trySetFeature(DocumentBuilderFactory factory, String feature, boolean value) {
        try {
            factory.setFeature(feature, value);
        } catch (Exception ignored) {
            // 不同 JDK 支持的 feature 略有差异
        }
    }

    private byte[] serialize(Document document) throws IOException {
        try {
            TransformerFactory factory = TransformerFactory.newInstance();
            try {
                factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            } catch (Exception ignored) {
                // 忽略不支持的安全特性
            }
            Transformer transformer = factory.newTransformer();
            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            transformer.transform(new DOMSource(document), new StreamResult(out));
            return out.toByteArray();
        } catch (Exception ex) {
            throw new IOException("无法写回 OFD 样式", ex);
        }
    }

    private void rewrite(Path ofd, Map<String, byte[]> replacements) throws IOException {
        OfdFileAccess.makeWritable(ofd);
        Path temp = Files.createTempFile(ofd.getParent(), ".ofd-style-", ".ofd");
        try {
            try (ZipInputStream in = new ZipInputStream(Files.newInputStream(ofd), StandardCharsets.UTF_8);
                 ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(temp), StandardCharsets.UTF_8)) {
                byte[] buffer = new byte[8192];
                ZipEntry entry;
                while ((entry = in.getNextEntry()) != null) {
                    ZipEntry copy = new ZipEntry(entry.getName());
                    if (entry.getTime() >= 0) {
                        copy.setTime(entry.getTime());
                    }
                    out.putNextEntry(copy);
                    byte[] replacement = replacements.get(entry.getName());
                    if (replacement != null) {
                        out.write(replacement);
                    } else {
                        int read;
                        while ((read = in.read(buffer)) != -1) {
                            out.write(buffer, 0, read);
                        }
                    }
                    out.closeEntry();
                    in.closeEntry();
                }
            }
            OfdFileAccess.replace(temp, ofd);
        } finally {
            Files.deleteIfExists(temp);
        }
    }
}

package com.adou.ofd.merge;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * 部分真实 OFD（尤其发票水印）在 Res 中声明了资源文件，但包内实际缺少该文件。
 * ofdrw 的 OFDMerger 在资源迁移时遇到缺失文件会直接失败，导致整次合并中止。
 *
 * <p>这里在合并前扫描 OFD 包内的资源引用，为缺失资源补充透明/空占位文件，
 * 让合并可以继续；源文档本来就无法显示该资源，占位不会引入新的可见内容。
 */
public class OfdResourceRepair {

    private static final Logger log = LoggerFactory.getLogger(OfdResourceRepair.class);
    private static final Pattern BASE_LOC = Pattern.compile("BaseLoc\\s*=\\s*\"([^\"]*)\"");
    private static final Pattern RES_FILE = Pattern.compile(
            "<(?:\\w+:)?(MediaFile|FontFile|Profile)\\b[^>]*>(.*?)</(?:\\w+:)?\\1>",
            Pattern.DOTALL);
    private static final byte[] TRANSPARENT_PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=");
    private static final byte[] TRANSPARENT_SVG = (
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>")
            .getBytes(StandardCharsets.UTF_8);

    public record RepairResult(int count, List<String> resources) {
    }

    public RepairResult repair(Path ofd) throws IOException {
        Set<String> additions;
        try (ZipFile zip = new ZipFile(ofd.toFile(), StandardCharsets.UTF_8)) {
            additions = findMissingResources(zip);
        }
        if (additions.isEmpty()) {
            return new RepairResult(0, List.of());
        }
        rewrite(ofd, additions);
        log.warn("OFD 资源缺失，已补充占位文件: {}", additions);
        return new RepairResult(additions.size(), List.copyOf(additions));
    }

    private Set<String> findMissingResources(ZipFile zip) throws IOException {
        Set<String> names = new LinkedHashSet<>();
        Enumeration<? extends ZipEntry> entries = zip.entries();
        while (entries.hasMoreElements()) {
            names.add(entries.nextElement().getName());
        }

        Set<String> missing = new LinkedHashSet<>();
        entries = zip.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            if (!entry.getName().toLowerCase(Locale.ROOT).endsWith(".xml")) {
                continue;
            }
            String xml;
            try (InputStream in = zip.getInputStream(entry)) {
                xml = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            Matcher baseMatcher = BASE_LOC.matcher(xml);
            String baseLoc = baseMatcher.find() ? baseMatcher.group(1) : null;
            String dir = directoryOf(entry.getName());
            String base = normalize(baseLoc == null || baseLoc.isBlank() ? dir : dir + baseLoc);

            Matcher matcher = RES_FILE.matcher(xml);
            while (matcher.find()) {
                String ref = matcher.group(2).trim();
                if (ref.isEmpty()) {
                    continue;
                }
                if (exists(names, dir, base, ref)) {
                    continue;
                }
                String target = ref.startsWith("/") ? normalize(ref.substring(1))
                        : normalize(base + "/" + ref);
                if (!target.isEmpty() && !names.contains(target)) {
                    missing.add(target);
                }
            }
        }
        return missing;
    }

    private boolean exists(Set<String> names, String dir, String base, String ref) {
        if (ref.startsWith("/")) {
            return names.contains(normalize(ref.substring(1)));
        }
        return names.contains(normalize(base + "/" + ref))
                || names.contains(normalize(dir + ref))
                || names.contains(normalize(dir + "Res/" + ref));
    }

    private void rewrite(Path ofd, Set<String> additions) throws IOException {
        Path temp = Files.createTempFile(ofd.getParent(), ".ofd-repair-", ".ofd");
        try {
            try (ZipInputStream in = new ZipInputStream(Files.newInputStream(ofd), StandardCharsets.UTF_8);
                 ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(temp), StandardCharsets.UTF_8)) {
                byte[] buffer = new byte[8192];
                ZipEntry entry;
                Set<String> copied = new LinkedHashSet<>();
                while ((entry = in.getNextEntry()) != null) {
                    ZipEntry copy = new ZipEntry(entry.getName());
                    if (entry.getTime() >= 0) {
                        copy.setTime(entry.getTime());
                    }
                    out.putNextEntry(copy);
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                    }
                    out.closeEntry();
                    in.closeEntry();
                    copied.add(entry.getName());
                }
                for (String name : additions) {
                    if (copied.contains(name)) {
                        continue;
                    }
                    ZipEntry placeholder = new ZipEntry(name);
                    out.putNextEntry(placeholder);
                    out.write(placeholderBytes(name));
                    out.closeEntry();
                }
            }
            try {
                Files.move(temp, ofd, StandardCopyOption.REPLACE_EXISTING,
                        StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(temp, ofd, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    private byte[] placeholderBytes(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return TRANSPARENT_PNG;
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return transparentJpeg();
        }
        if (lower.endsWith(".svg")) {
            return TRANSPARENT_SVG;
        }
        return new byte[0];
    }

    private byte[] transparentJpeg() {
        try {
            BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            if (!ImageIO.write(image, "jpg", out)) {
                return new byte[0];
            }
            return out.toByteArray();
        } catch (IOException ex) {
            return new byte[0];
        }
    }

    private String directoryOf(String name) {
        int index = name.lastIndexOf('/');
        return index < 0 ? "" : name.substring(0, index + 1);
    }

    private String normalize(String value) {
        String path = value.replace('\\', '/');
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        List<String> parts = new ArrayList<>();
        for (String part : path.split("/")) {
            if (part.isEmpty() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part)) {
                if (!parts.isEmpty()) {
                    parts.remove(parts.size() - 1);
                }
            } else {
                parts.add(part);
            }
        }
        return String.join("/", parts);
    }
}

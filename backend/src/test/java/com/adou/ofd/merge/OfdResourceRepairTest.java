package com.adou.ofd.merge;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfdResourceRepairTest {

    private Path workDir;

    @BeforeEach
    void setUp() throws IOException {
        workDir = Files.createTempDirectory("ofd-repair-test-");
    }

    @Test
    void addsPlaceholderForMissingImage() throws Exception {
        Path ofd = writeOfd("missing.png", Map.of());
        OfdResourceRepair repair = new OfdResourceRepair();

        OfdResourceRepair.RepairResult result = repair.repair(ofd);

        assertEquals(1, result.count());
        assertTrue(result.resources().contains("Doc_0/Res/missing.png"));
        try (ZipFile zip = new ZipFile(ofd.toFile())) {
            byte[] bytes = zip.getInputStream(zip.getEntry("Doc_0/Res/missing.png")).readAllBytes();
            assertArrayEquals(new byte[]{(byte) 0x89, 'P', 'N', 'G'}, new byte[]{
                    bytes[0], bytes[1], bytes[2], bytes[3]
            });
        }
        assertEquals(0, repair.repair(ofd).count(), "重复修复不应再添加文件");
    }

    @Test
    void keepsExistingAndAbsoluteResources() throws Exception {
        Path ofd = writeOfd("ok.png", Map.of("Doc_0/Res/ok.png", new byte[]{1, 2, 3}));
        OfdResourceRepair repair = new OfdResourceRepair();

        assertEquals(0, repair.repair(ofd).count());

        Path absolute = writeOfd("/Doc_0/Res/ok.png", Map.of("Doc_0/Res/ok.png", new byte[]{1}));
        assertEquals(0, repair.repair(absolute).count());
    }

    private Path writeOfd(String mediaFile, Map<String, byte[]> entries) throws IOException {
        Path file = workDir.resolve("sample-" + Math.abs(mediaFile.hashCode()) + ".ofd");
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(file))) {
            put(out, "OFD.xml", "<ofd:OFD xmlns:ofd=\"http://www.ofdspec.org/2016\"/>"
                    .getBytes(StandardCharsets.UTF_8));
            String xml = "<ofd:Res xmlns:ofd=\"http://www.ofdspec.org/2016\" BaseLoc=\"Res\">"
                    + "<ofd:MultiMedias><ofd:MultiMedia ID=\"1\" Type=\"Image\">"
                    + "<ofd:MediaFile>" + mediaFile + "</ofd:MediaFile>"
                    + "</ofd:MultiMedia></ofd:MultiMedias></ofd:Res>";
            put(out, "Doc_0/DocumentRes.xml", xml.getBytes(StandardCharsets.UTF_8));
            for (Map.Entry<String, byte[]> entry : new LinkedHashMap<>(entries).entrySet()) {
                put(out, entry.getKey(), entry.getValue());
            }
        }
        return file;
    }

    private void put(ZipOutputStream out, String name, byte[] bytes) throws IOException {
        out.putNextEntry(new ZipEntry(name));
        out.write(bytes);
        out.closeEntry();
    }
}

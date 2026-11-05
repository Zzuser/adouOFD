package com.adou.ofd.server;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TempCleanupTest {

    @TempDir
    Path root;

    @Test
    void removesOnlyStaleEngineDirectories() throws Exception {
        Path oldDoc = Files.createDirectories(root.resolve("adou-doc-old").resolve("render"));
        Files.writeString(oldDoc.resolve("page.png"), "x");
        Path oldDocRoot = oldDoc.getParent();
        Path freshDoc = Files.createDirectories(root.resolve("adou-doc-fresh"));
        Path oldUnrelated = Files.createDirectories(root.resolve("unrelated-old"));

        Instant stale = Instant.now().minus(Duration.ofHours(2));
        Files.setLastModifiedTime(oldDocRoot, FileTime.from(stale));
        Files.setLastModifiedTime(oldUnrelated, FileTime.from(stale));

        TempCleanup.clean(root, Instant.now().minus(Duration.ofHours(1)));

        assertFalse(Files.exists(oldDocRoot));
        assertTrue(Files.exists(freshDoc));
        assertTrue(Files.exists(oldUnrelated));
    }
}

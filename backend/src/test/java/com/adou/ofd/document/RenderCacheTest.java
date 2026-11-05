package com.adou.ofd.document;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RenderCacheTest {

    @TempDir
    Path root;

    @Test
    void evictsOldestWhenBudgetExceeded() throws Exception {
        RenderCache cache = new RenderCache(100);
        Path first = write("first.png", 60);
        Path second = write("second.png", 60);

        cache.record(first);
        cache.record(second);

        assertFalse(Files.exists(first));
        assertTrue(Files.exists(second));
        assertEquals(60, cache.bytes());
    }

    @Test
    void cacheHitRefreshesEvictionOrder() throws Exception {
        RenderCache cache = new RenderCache(120);
        Path first = write("first.png", 60);
        Path second = write("second.png", 60);
        cache.record(first);
        cache.record(second);
        cache.record(first);

        Path third = write("third.png", 60);
        cache.record(third);

        assertTrue(Files.exists(first));
        assertFalse(Files.exists(second));
        assertTrue(Files.exists(third));
        assertEquals(120, cache.bytes());
    }

    private Path write(String name, int bytes) throws IOException {
        Path file = root.resolve(name);
        Files.write(file, new byte[bytes]);
        return file;
    }
}

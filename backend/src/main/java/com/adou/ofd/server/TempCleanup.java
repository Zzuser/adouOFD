package com.adou.ofd.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * 清理异常退出遗留的引擎临时目录。
 *
 * <p>只处理超过保留期的目录，开发版与安装版可能共用系统临时目录，
 * 不能用“启动即全删”误伤另一个正在运行的实例。
 */
public final class TempCleanup {

    private static final Logger log = LoggerFactory.getLogger(TempCleanup.class);
    private static final Duration RETENTION = Duration.ofHours(24);
    private static final List<String> PREFIXES = List.of(
            "adou-doc-", "adou-shard-", "adou-merge-work-", "adou-pages-work-");

    private TempCleanup() {
    }

    public static void runAsync() {
        Path root = Path.of(System.getProperty("java.io.tmpdir"));
        Instant staleBefore = Instant.now().minus(RETENTION);
        Thread thread = new Thread(() -> clean(root, staleBefore), "adou-temp-cleanup");
        thread.setDaemon(true);
        thread.start();
    }

    static void clean(Path root, Instant staleBefore) {
        if (root == null || !Files.isDirectory(root)) {
            return;
        }
        List<Path> candidates = new ArrayList<>();
        try (Stream<Path> entries = Files.list(root)) {
            entries.filter(Files::isDirectory).forEach(candidates::add);
        } catch (IOException ex) {
            log.debug("扫描临时目录失败: {}", root, ex);
            return;
        }
        for (Path dir : candidates) {
            String name = dir.getFileName().toString();
            if (PREFIXES.stream().noneMatch(name::startsWith)) {
                continue;
            }
            try {
                FileTime modified = Files.getLastModifiedTime(dir);
                if (modified.toInstant().isAfter(staleBefore)) {
                    continue;
                }
                deleteRecursively(dir);
                log.info("已清理遗留临时目录: {}", dir);
            } catch (IOException ex) {
                log.debug("清理临时目录失败: {}", dir, ex);
            }
        }
    }

    static void deleteRecursively(Path dir) throws IOException {
        try (Stream<Path> paths = Files.walk(dir)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}

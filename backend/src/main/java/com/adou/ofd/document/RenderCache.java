package com.adou.ofd.document;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 单个文档会话的页面 PNG 磁盘缓存预算。
 *
 * <p>同一页在不同 DPI / 旋转下会生成不同文件；长文档连续缩放时缓存可能达到数 GB。
 * 超过预算按写入顺序淘汰最旧的页面图，最近访问的页面不受影响。
 */
final class RenderCache {

    private static final Logger log = LoggerFactory.getLogger(RenderCache.class);
    private static final long DEFAULT_MAX_BYTES = 384L * 1024 * 1024;

    private final long maxBytes;
    private final LinkedHashMap<Path, Long> files = new LinkedHashMap<>();
    private long bytes;

    RenderCache() {
        this(DEFAULT_MAX_BYTES);
    }

    RenderCache(long maxBytes) {
        this.maxBytes = Math.max(1, maxBytes);
    }

    synchronized void record(Path file) {
        Long existing = files.remove(file);
        if (existing != null) {
            // 命中缓存时刷新为最近使用，避免刚看过的页面被淘汰
            files.put(file, existing);
            return;
        }
        long size;
        try {
            size = Files.size(file);
        } catch (IOException ex) {
            return;
        }
        files.put(file, size);
        bytes += size;
        trim();
    }

    synchronized long bytes() {
        return bytes;
    }

    private void trim() {
        Iterator<Map.Entry<Path, Long>> iterator = files.entrySet().iterator();
        while (bytes > maxBytes && files.size() > 1 && iterator.hasNext()) {
            Map.Entry<Path, Long> entry = iterator.next();
            Path path = entry.getKey();
            try {
                Files.deleteIfExists(path);
            } catch (IOException ex) {
                // 文件可能正被 HTTP 响应读取：保留并停止本轮清理，避免反复失败
                log.debug("删除渲染缓存失败: {}", path, ex);
                return;
            }
            bytes -= entry.getValue();
            iterator.remove();
            deleteEmptyParent(path);
        }
    }

    private void deleteEmptyParent(Path file) {
        Path parent = file.getParent();
        if (parent == null) {
            return;
        }
        try {
            Files.deleteIfExists(parent);
        } catch (IOException ignored) {
            // 目录里还有其它页面，属于正常情况
        }
    }
}

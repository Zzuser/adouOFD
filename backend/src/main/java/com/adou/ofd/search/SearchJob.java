package com.adou.ofd.search;

import java.time.Instant;
import java.util.List;

/**
 * 搜索任务快照，直接作为 REST 响应体。hits 为增量结果，轮询时可能继续增长。
 */
public record SearchJob(
        String id,
        String documentId,
        String status,
        String query,
        boolean caseSensitive,
        int totalPages,
        int scannedPages,
        int progress,
        int matchCount,
        boolean truncated,
        int failedPages,
        List<SearchHit> hits,
        String errorCode,
        String errorMessage,
        Instant createdAt,
        Instant finishedAt) {
}

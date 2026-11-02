package com.adou.ofd.merge;

import java.time.Instant;

/**
 * 合并任务快照，直接作为 REST 响应体。
 */
public record MergeJob(
        String id,
        String status,
        int progress,
        String phase,
        String target,
        String outputPath,
        String outputName,
        int fileCount,
        int sourcePages,
        MergeReport report,
        String errorCode,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant finishedAt) {
}

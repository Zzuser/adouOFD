package com.adou.ofd.convert;

import java.time.Instant;

/**
 * 转换任务快照，直接作为 REST 响应体。
 */
public record ConversionJob(
        String id,
        String status,
        int progress,
        String phase,
        String sourcePath,
        String sourceName,
        String sourceKind,
        int sourcePages,
        String target,
        String outputPath,
        String outputName,
        ConversionReport report,
        String errorCode,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant finishedAt) {
}

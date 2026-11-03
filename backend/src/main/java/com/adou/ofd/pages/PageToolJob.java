package com.adou.ofd.pages;

import java.time.Instant;
import java.util.List;

/**
 * 拆分/插页任务快照，直接作为 REST 响应体。
 */
public record PageToolJob(
        String id,
        String operation,
        String status,
        int progress,
        String phase,
        String sourcePath,
        String sourceName,
        int sourcePages,
        String insertPath,
        String insertName,
        int insertPages,
        String outputPath,
        String outputName,
        String outputDir,
        List<PageOutput> outputs,
        int outputPages,
        int outputFiles,
        long outputBytes,
        List<String> warnings,
        String errorCode,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant finishedAt) {
}

package com.adou.ofd.pages;

import com.adou.ofd.convert.ConversionStatus;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Future;

/**
 * 一次拆分/插页任务的可变状态；对外只暴露 {@link #snapshot()}。
 */
final class PageToolTask {

    private final String id;
    private final String operation;
    private final Path source;
    private final String sourceKind;
    private final int sourcePages;
    private final Path insertSource;
    private final String insertKind;
    private final int insertPageCount;
    private final List<Integer> insertPages;
    private final int position;
    private final List<SplitPlan> splitPlans;
    private final Path outputDir;
    private final Path output;
    private final boolean overwrite;
    private final Instant createdAt = Instant.now();

    private volatile ConversionStatus status = ConversionStatus.QUEUED;
    private volatile int progress;
    private volatile String phase = "排队中";
    private volatile List<PageOutput> outputs = List.of();
    private volatile int outputPages;
    private volatile long outputBytes;
    private volatile List<String> warnings = List.of();
    private volatile String errorCode;
    private volatile String errorMessage;
    private volatile Instant startedAt;
    private volatile Instant finishedAt;
    private volatile boolean cancelRequested;
    private volatile Future<?> future;

    private PageToolTask(
            String id,
            String operation,
            Path source,
            String sourceKind,
            int sourcePages,
            Path insertSource,
            String insertKind,
            int insertPageCount,
            List<Integer> insertPages,
            int position,
            List<SplitPlan> splitPlans,
            Path outputDir,
            Path output,
            boolean overwrite) {
        this.id = id;
        this.operation = operation;
        this.source = source;
        this.sourceKind = sourceKind;
        this.sourcePages = sourcePages;
        this.insertSource = insertSource;
        this.insertKind = insertKind;
        this.insertPageCount = insertPageCount;
        this.insertPages = insertPages == null ? List.of() : List.copyOf(insertPages);
        this.position = position;
        this.splitPlans = splitPlans == null ? List.of() : List.copyOf(splitPlans);
        this.outputDir = outputDir;
        this.output = output;
        this.overwrite = overwrite;
    }

    static PageToolTask split(String id, Path source, String kind, int pages,
                              List<SplitPlan> plans, Path outputDir) {
        return new PageToolTask(id, "SPLIT", source, kind, pages,
                null, null, 0, List.of(), 0, plans, outputDir, null, false);
    }

    static PageToolTask insert(String id, Path source, String kind, int pages,
                               Path insertSource, String insertKind, int insertPageCount,
                               List<Integer> insertPages, int position, Path output, boolean overwrite) {
        return new PageToolTask(id, "INSERT", source, kind, pages,
                insertSource, insertKind, insertPageCount, insertPages, position,
                null, null, output, overwrite);
    }

    String id() {
        return id;
    }

    String operation() {
        return operation;
    }

    Path source() {
        return source;
    }

    String sourceKind() {
        return sourceKind;
    }

    int sourcePages() {
        return sourcePages;
    }

    Path insertSource() {
        return insertSource;
    }

    String insertKind() {
        return insertKind;
    }

    int insertPageCount() {
        return insertPageCount;
    }

    List<Integer> insertPages() {
        return insertPages;
    }

    int position() {
        return position;
    }

    List<SplitPlan> splitPlans() {
        return splitPlans;
    }

    Path outputDir() {
        return outputDir;
    }

    Path output() {
        return output;
    }

    boolean overwrite() {
        return overwrite;
    }

    ConversionStatus status() {
        return status;
    }

    int progress() {
        return progress;
    }

    List<PageOutput> outputs() {
        return outputs;
    }

    boolean cancelRequested() {
        return cancelRequested;
    }

    Future<?> future() {
        return future;
    }

    void attach(Future<?> future) {
        this.future = future;
    }

    void requestCancel() {
        this.cancelRequested = true;
    }

    void markRunning() {
        this.status = ConversionStatus.RUNNING;
        this.startedAt = Instant.now();
        this.progress = 1;
        this.phase = "SPLIT".equals(operation) ? "准备拆分" : "准备插入页面";
    }

    void updateProgress(int percent, String phase) {
        if (status.terminal()) {
            return;
        }
        this.progress = Math.max(this.progress, Math.min(99, percent));
        if (phase != null && !phase.isBlank()) {
            this.phase = phase;
        }
    }

    void succeed(List<PageOutput> outputs, int outputPages, long outputBytes, List<String> warnings) {
        this.outputs = List.copyOf(outputs);
        this.outputPages = outputPages;
        this.outputBytes = outputBytes;
        this.warnings = warnings == null ? List.of() : List.copyOf(warnings);
        this.progress = 100;
        this.phase = "SPLIT".equals(operation) ? "拆分完成" : "插入完成";
        this.status = ConversionStatus.SUCCEEDED;
        this.finishedAt = Instant.now();
    }

    void fail(String code, String message) {
        this.errorCode = code;
        this.errorMessage = message;
        this.phase = "SPLIT".equals(operation) ? "拆分失败" : "插入失败";
        this.status = ConversionStatus.FAILED;
        this.finishedAt = Instant.now();
    }

    void canceled() {
        this.phase = "已取消";
        this.status = ConversionStatus.CANCELED;
        this.finishedAt = Instant.now();
    }

    PageToolJob snapshot() {
        return new PageToolJob(
                id,
                operation,
                status.name(),
                progress,
                phase,
                source.toString(),
                source.getFileName().toString(),
                sourcePages,
                insertSource == null ? null : insertSource.toString(),
                insertSource == null ? null : insertSource.getFileName().toString(),
                insertPageCount,
                output == null ? null : output.toString(),
                output == null ? null : output.getFileName().toString(),
                outputDir == null ? null : outputDir.toString(),
                outputs,
                outputPages,
                outputs.size(),
                outputBytes,
                warnings,
                errorCode,
                errorMessage,
                createdAt,
                startedAt,
                finishedAt);
    }
}

package com.adou.ofd.convert;

import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.Future;

/**
 * 一次转换任务的可变状态；对外只暴露 {@link #snapshot()} 的不可变快照。
 */
final class ConversionTask {

    private final String id;
    private final Path source;
    private final String sourceKind;
    private final int sourcePages;
    private final String target;
    private final Path output;
    private final Instant createdAt = Instant.now();

    private volatile ConversionStatus status = ConversionStatus.QUEUED;
    private volatile int progress;
    private volatile String phase = "排队中";
    private volatile ConversionReport report;
    private volatile String errorCode;
    private volatile String errorMessage;
    private volatile Instant startedAt;
    private volatile Instant finishedAt;
    private volatile boolean cancelRequested;
    private volatile Future<?> future;

    ConversionTask(String id, Path source, String sourceKind, int sourcePages, String target, Path output) {
        this.id = id;
        this.source = source;
        this.sourceKind = sourceKind;
        this.sourcePages = sourcePages;
        this.target = target;
        this.output = output;
    }

    String id() {
        return id;
    }

    Path source() {
        return source;
    }

    String target() {
        return target;
    }

    Path output() {
        return output;
    }

    int sourcePages() {
        return sourcePages;
    }

    ConversionStatus status() {
        return status;
    }

    int progress() {
        return progress;
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
        this.phase = "准备转换";
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

    void succeed(ConversionReport report) {
        this.report = report;
        this.progress = 100;
        this.phase = "转换完成";
        this.status = ConversionStatus.SUCCEEDED;
        this.finishedAt = Instant.now();
    }

    void fail(String code, String message) {
        this.errorCode = code;
        this.errorMessage = message;
        this.phase = "转换失败";
        this.status = ConversionStatus.FAILED;
        this.finishedAt = Instant.now();
    }

    void canceled() {
        this.phase = "已取消";
        this.status = ConversionStatus.CANCELED;
        this.finishedAt = Instant.now();
    }

    ConversionJob snapshot() {
        return new ConversionJob(
                id,
                status.name(),
                progress,
                phase,
                source.toString(),
                source.getFileName().toString(),
                sourceKind,
                sourcePages,
                target,
                output.toString(),
                output.getFileName().toString(),
                report,
                errorCode,
                errorMessage,
                createdAt,
                startedAt,
                finishedAt);
    }
}

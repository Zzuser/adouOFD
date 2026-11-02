package com.adou.ofd.merge;

import com.adou.ofd.convert.ConversionStatus;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Future;

/**
 * 一次合并任务的可变状态；对外只暴露 {@link #snapshot()}。
 */
final class MergeTask {

    private final String id;
    private final List<Path> files;
    private final String target;
    private final Path output;
    private final Instant createdAt = Instant.now();

    private volatile ConversionStatus status = ConversionStatus.QUEUED;
    private volatile int progress;
    private volatile String phase = "排队中";
    private volatile MergeReport report;
    private volatile String errorCode;
    private volatile String errorMessage;
    private volatile Instant startedAt;
    private volatile Instant finishedAt;
    private volatile boolean cancelRequested;
    private volatile Future<?> future;

    MergeTask(String id, List<Path> files, String target, Path output) {
        this.id = id;
        this.files = List.copyOf(files);
        this.target = target;
        this.output = output;
    }

    String id() {
        return id;
    }

    List<Path> files() {
        return files;
    }

    String target() {
        return target;
    }

    Path output() {
        return output;
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
        this.phase = "准备合并";
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

    void succeed(MergeReport report) {
        this.report = report;
        this.progress = 100;
        this.phase = "合并完成";
        this.status = ConversionStatus.SUCCEEDED;
        this.finishedAt = Instant.now();
    }

    void fail(String code, String message) {
        this.errorCode = code;
        this.errorMessage = message;
        this.phase = "合并失败";
        this.status = ConversionStatus.FAILED;
        this.finishedAt = Instant.now();
    }

    void canceled() {
        this.phase = "已取消";
        this.status = ConversionStatus.CANCELED;
        this.finishedAt = Instant.now();
    }

    MergeJob snapshot() {
        return new MergeJob(
                id,
                status.name(),
                progress,
                phase,
                target,
                output.toString(),
                output.getFileName().toString(),
                files.size(),
                report == null ? 0 : report.sourcePages(),
                report,
                errorCode,
                errorMessage,
                createdAt,
                startedAt,
                finishedAt);
    }
}

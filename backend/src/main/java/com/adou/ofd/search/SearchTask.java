package com.adou.ofd.search;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Future;

/**
 * 可变搜索任务。快照与状态变更都在任务锁内完成，搜索线程与轮询线程可并发访问。
 */
final class SearchTask {

    static final int MAX_HITS = 300;

    private final String id;
    private final String documentId;
    private final String query;
    private final boolean caseSensitive;
    private final int totalPages;
    private final Instant createdAt = Instant.now();
    private final List<SearchHit> hits = new ArrayList<>();

    private volatile boolean cancelRequested;
    private String status = "RUNNING";
    private int scannedPages;
    private int matchCount;
    private int failedPages;
    private boolean truncated;
    private String errorCode;
    private String errorMessage;
    private Instant finishedAt;
    private Future<?> future;

    SearchTask(String id, String documentId, String query, boolean caseSensitive, int totalPages) {
        this.id = id;
        this.documentId = documentId;
        this.query = query;
        this.caseSensitive = caseSensitive;
        this.totalPages = totalPages;
    }

    String id() {
        return id;
    }

    String documentId() {
        return documentId;
    }

    String query() {
        return query;
    }

    boolean caseSensitive() {
        return caseSensitive;
    }

    int totalPages() {
        return totalPages;
    }

    boolean cancelRequested() {
        return cancelRequested;
    }

    synchronized void attach(Future<?> value) {
        future = value;
    }

    synchronized boolean terminal() {
        return !"RUNNING".equals(status);
    }

    synchronized void scanned(int page) {
        scannedPages = Math.max(scannedPages, page);
    }

    synchronized void recordMatch(SearchHit hit) {
        matchCount++;
        if (hits.size() < MAX_HITS) {
            hits.add(hit);
        } else {
            truncated = true;
        }
    }

    synchronized void pageFailed() {
        failedPages++;
    }

    void requestCancel() {
        synchronized (this) {
            if (terminal()) {
                return;
            }
            cancelRequested = true;
            if (future != null && future.cancel(false)) {
                status = "CANCELED";
                finishedAt = Instant.now();
            }
        }
    }

    synchronized void canceled() {
        if (terminal()) {
            return;
        }
        status = "CANCELED";
        finishedAt = Instant.now();
    }

    synchronized void succeed() {
        if (terminal()) {
            return;
        }
        status = cancelRequested ? "CANCELED" : "SUCCEEDED";
        finishedAt = Instant.now();
    }

    synchronized void fail(String code, String message) {
        if (terminal()) {
            return;
        }
        status = cancelRequested ? "CANCELED" : "FAILED";
        errorCode = cancelRequested ? null : code;
        errorMessage = cancelRequested ? null : message;
        finishedAt = Instant.now();
    }

    synchronized SearchJob snapshot() {
        int progress = totalPages <= 0
                ? 0
                : Math.min(100, scannedPages * 100 / totalPages);
        return new SearchJob(
                id,
                documentId,
                status,
                query,
                caseSensitive,
                totalPages,
                scannedPages,
                progress,
                matchCount,
                truncated,
                failedPages,
                List.copyOf(hits),
                errorCode,
                errorMessage,
                createdAt,
                finishedAt);
    }
}

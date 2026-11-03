package com.adou.ofd.search;

import com.adou.ofd.document.DocumentService;
import com.adou.ofd.document.DocumentSummary;
import com.adou.ofd.document.TextRun;
import com.adou.ofd.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.adou.ofd.web.Http;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * 全文搜索调度：单线程后台扫描，逐页返回增量命中，不阻塞页面渲染。
 *
 * <p>单个任务只读已打开的文档会话；文档被关闭或会话被淘汰时任务以 DOCUMENT_CLOSED 结束。
 */
public class SearchService {

    private static final Logger log = LoggerFactory.getLogger(SearchService.class);
    private static final int MAX_QUERY_LENGTH = 200;
    private static final int MAX_HISTORY = 20;
    private static final int SNIPPET_BEFORE = 36;
    private static final int SNIPPET_AFTER = 56;

    private final DocumentService documents;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "adou-search");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, SearchTask> tasks = new LinkedHashMap<>();

    public SearchService(DocumentService documents) {
        this.documents = documents;
    }

    public SearchJob submit(String documentId, SearchRequest request) {
        if (request == null || request.query() == null || request.query().isBlank()) {
            throw new ApiException(Http.BAD_REQUEST, "SEARCH_QUERY_REQUIRED", "请输入搜索关键词");
        }
        String query = request.query().trim();
        if (query.length() > MAX_QUERY_LENGTH) {
            throw new ApiException(Http.BAD_REQUEST, "SEARCH_QUERY_TOO_LONG",
                    "搜索关键词不能超过 " + MAX_QUERY_LENGTH + " 个字符");
        }
        DocumentSummary summary = documents.summary(documentId);

        cancelForDocument(documentId);
        SearchTask task = new SearchTask(
                UUID.randomUUID().toString(),
                documentId,
                query,
                Boolean.TRUE.equals(request.caseSensitive()),
                summary.pageCount());
        synchronized (tasks) {
            trimHistory();
            tasks.put(task.id(), task);
        }
        try {
            task.attach(executor.submit(() -> run(task)));
        } catch (RejectedExecutionException ex) {
            synchronized (tasks) {
                tasks.remove(task.id());
            }
            throw new ApiException(Http.TOO_MANY_REQUESTS, "SEARCH_QUEUE_FULL",
                    "搜索任务过多，请稍后重试");
        }
        return task.snapshot();
    }

    public SearchJob get(String documentId, String searchId) {
        return require(documentId, searchId).snapshot();
    }

    public SearchJob cancel(String documentId, String searchId) {
        SearchTask task = require(documentId, searchId);
        task.requestCancel();
        return task.snapshot();
    }

    public void shutdown() {
        executor.shutdownNow();
    }

    private void run(SearchTask task) {
        try {
            if (task.cancelRequested()) {
                task.canceled();
                return;
            }
            String needle = normalizeQuery(task.query(), task.caseSensitive());
            for (int page = 1; page <= task.totalPages(); page++) {
                if (task.cancelRequested() || Thread.currentThread().isInterrupted()) {
                    task.canceled();
                    return;
                }
                List<TextRun> runs;
                try {
                    runs = documents.pageText(task.documentId(), page);
                } catch (ApiException ex) {
                    if ("SESSION_NOT_FOUND".equals(ex.getCode())) {
                        task.fail("DOCUMENT_CLOSED", "文档已关闭，搜索已停止");
                        return;
                    }
                    task.pageFailed();
                    task.scanned(page);
                    continue;
                } catch (StackOverflowError | RuntimeException error) {
                    task.pageFailed();
                    task.scanned(page);
                    continue;
                }
                try {
                    scanPage(task, page, runs, needle);
                } catch (RuntimeException ex) {
                    log.debug("搜索第 {} 页失败: document={}", page, task.documentId(), ex);
                    task.pageFailed();
                }
                task.scanned(page);
            }
            task.succeed();
        } catch (OutOfMemoryError error) {
            log.error("搜索内存不足: document={}", task.documentId(), error);
            task.fail("OUT_OF_MEMORY", "内存不足，无法完成搜索；请关闭其他文档后重试");
        } catch (Throwable error) {
            log.error("搜索异常终止: document={}", task.documentId(), error);
            task.fail("SEARCH_FAILED", "搜索失败：" + error.getClass().getSimpleName());
        }
    }

    private void scanPage(SearchTask task, int page, List<TextRun> runs, String needle) {
        if (runs == null || runs.isEmpty() || needle.isEmpty()) {
            return;
        }
        int rawLength = 0;
        for (TextRun run : runs) {
            rawLength += run.text().length();
        }
        if (rawLength == 0) {
            return;
        }

        StringBuilder rawBuilder = new StringBuilder(rawLength);
        int[] runStarts = new int[runs.size()];
        for (int index = 0; index < runs.size(); index++) {
            runStarts[index] = rawBuilder.length();
            rawBuilder.append(runs.get(index).text());
        }
        String raw = rawBuilder.toString();
        NormalizedPage normalized = normalize(raw, task.caseSensitive());
        if (normalized == null) {
            return;
        }

        int from = 0;
        while (from <= normalized.folded().length() - needle.length()) {
            int index = normalized.folded().indexOf(needle, from);
            if (index < 0) {
                break;
            }
            int normStart = index;
            int normEnd = index + needle.length();
            int rawStart = normalized.startMap()[normStart];
            int rawEnd = normalized.endMap()[normEnd - 1];
            task.recordMatch(buildHit(page, rawStart, rawEnd, normalized, normStart, normEnd, runs, runStarts));
            from = normEnd;
        }
    }

    private SearchHit buildHit(int page, int rawStart, int rawEnd, NormalizedPage pageText,
                               int normStart, int normEnd, List<TextRun> runs, int[] runStarts) {
        int beforeStart = Math.max(0, normStart - SNIPPET_BEFORE);
        int afterEnd = Math.min(pageText.display().length(), normEnd + SNIPPET_AFTER);
        String before = pageText.display().substring(beforeStart, normStart);
        String match = pageText.display().substring(normStart, normEnd);
        String after = pageText.display().substring(normEnd, afterEnd);

        double x = 0;
        double y = 0;
        double height = 0;
        int runIndex = runIndexAt(runStarts, runs, rawStart);
        if (runIndex >= 0) {
            TextRun run = runs.get(runIndex);
            x = run.x();
            y = run.y();
            height = run.height();
        }
        return new SearchHit(
                page,
                rawStart,
                rawEnd,
                before,
                match,
                after,
                beforeStart > 0,
                afterEnd < pageText.display().length(),
                x,
                y,
                height);
    }

    private int runIndexAt(int[] runStarts, List<TextRun> runs, int offset) {
        int low = 0;
        int high = runStarts.length - 1;
        int found = -1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            if (runStarts[mid] <= offset) {
                found = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        if (found < 0) {
            return -1;
        }
        int end = runStarts[found] + runs.get(found).text().length();
        return offset < end ? found : -1;
    }

    private NormalizedPage normalize(String raw, boolean caseSensitive) {
        StringBuilder display = new StringBuilder(raw.length());
        StringBuilder folded = new StringBuilder(raw.length());
        int[] startMap = new int[raw.length()];
        int[] endMap = new int[raw.length()];
        boolean sawContent = false;
        boolean pendingSpace = false;

        for (int index = 0; index < raw.length(); ) {
            int codePoint = raw.codePointAt(index);
            int charCount = Character.charCount(codePoint);
            if (isSpace(codePoint)) {
                if (sawContent) {
                    pendingSpace = true;
                }
                index += charCount;
                continue;
            }
            if (pendingSpace) {
                int position = display.length();
                display.append(' ');
                folded.append(' ');
                startMap[position] = index;
                endMap[position] = index + charCount;
                pendingSpace = false;
            }
            int position = display.length();
            display.appendCodePoint(codePoint);
            folded.appendCodePoint(caseSensitive ? codePoint : Character.toLowerCase(codePoint));
            for (int charIndex = 0; charIndex < charCount; charIndex++) {
                startMap[position + charIndex] = index;
                endMap[position + charIndex] = index + charCount;
            }
            sawContent = true;
            index += charCount;
        }
        if (display.isEmpty()) {
            return null;
        }
        return new NormalizedPage(display.toString(), folded.toString(), startMap, endMap);
    }

    private String normalizeQuery(String query, boolean caseSensitive) {
        StringBuilder result = new StringBuilder(query.length());
        boolean sawContent = false;
        boolean pendingSpace = false;
        for (int index = 0; index < query.length(); ) {
            int codePoint = query.codePointAt(index);
            int charCount = Character.charCount(codePoint);
            if (isSpace(codePoint)) {
                if (sawContent) {
                    pendingSpace = true;
                }
            } else {
                if (pendingSpace) {
                    result.append(' ');
                    pendingSpace = false;
                }
                result.appendCodePoint(caseSensitive ? codePoint : Character.toLowerCase(codePoint));
                sawContent = true;
            }
            index += charCount;
        }
        return result.toString();
    }

    private boolean isSpace(int codePoint) {
        return Character.isWhitespace(codePoint) || codePoint == '\u00A0' || codePoint == '\u3000';
    }

    private void cancelForDocument(String documentId) {
        List<SearchTask> active;
        synchronized (tasks) {
            active = new ArrayList<>(tasks.values());
        }
        for (SearchTask task : active) {
            if (task.documentId().equals(documentId)) {
                task.requestCancel();
            }
        }
    }

    private void trimHistory() {
        while (tasks.size() >= MAX_HISTORY) {
            var iterator = tasks.entrySet().iterator();
            boolean removed = false;
            while (iterator.hasNext()) {
                if (iterator.next().getValue().terminal()) {
                    iterator.remove();
                    removed = true;
                    break;
                }
            }
            if (!removed) {
                return;
            }
        }
    }

    private SearchTask require(String documentId, String searchId) {
        synchronized (tasks) {
            SearchTask task = tasks.get(searchId);
            if (task == null || !task.documentId().equals(documentId)) {
                throw new ApiException(Http.NOT_FOUND, "SEARCH_NOT_FOUND", "搜索任务不存在");
            }
            return task;
        }
    }

    private record NormalizedPage(String display, String folded, int[] startMap, int[] endMap) {
    }
}

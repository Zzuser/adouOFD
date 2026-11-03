package com.adou.ofd.convert;

import com.adou.ofd.document.DocumentService;
import com.adou.ofd.document.DocumentSummary;
import com.adou.ofd.web.ApiException;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.adou.ofd.web.Http;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;

/**
 * 转换任务调度：单工作线程 + 有界队列，保证转换不会抢占阅读渲染的 CPU 与内存。
 *
 * <p>输出永远写入临时文件，校验通过后再原子替换到目标路径；源文件只读。
 */
public class ConversionService {

    private static final Logger log = LoggerFactory.getLogger(ConversionService.class);
    private static final int MAX_HISTORY = 20;
    private static final int MAX_PROBE_FILES = 200;
    private static final String TEMP_MARK = ".adou-tmp-";

    private final DocumentService documents;
    private final ConversionEngine engine;
    private final HeavyTaskExecutor executor;
    private final Map<String, ConversionTask> tasks = new LinkedHashMap<>();

    public ConversionService(DocumentService documents, ConversionEngine engine,
                             HeavyTaskExecutor executor) {
        this.documents = documents;
        this.engine = engine;
        this.executor = executor;
    }

    public ConversionJob submit(ConversionRequest request) {
        if (request == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_REQUEST", "请提供转换参数");
        }
        ResolvedSource source = resolveSource(request);
        String target = resolveTarget(request.target(), source.kind());
        Path output = resolveOutput(request.outputPath(), target, source.path(), Boolean.TRUE.equals(request.overwrite()));

        ConversionTask task = new ConversionTask(
                UUID.randomUUID().toString(),
                source.path(),
                source.kind(),
                source.pages(),
                target,
                output);
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
            throw new ApiException(Http.TOO_MANY_REQUESTS, "CONVERSION_QUEUE_FULL",
                    "转换队列已满，请等待当前任务完成后再试");
        }
        return task.snapshot();
    }

    public ConversionJob get(String id) {
        return require(id).snapshot();
    }

    /**
     * 批量添加文件时使用：只读元数据，不建立阅读会话、不写文件。
     */
    public List<ProbeResult> probe(List<String> rawPaths) {
        if (rawPaths == null || rawPaths.isEmpty()) {
            return List.of();
        }
        List<ProbeResult> results = new ArrayList<>();
        for (String raw : rawPaths.subList(0, Math.min(rawPaths.size(), MAX_PROBE_FILES))) {
            String value = trimToNull(raw);
            if (value == null) {
                continue;
            }
            Path path;
            try {
                path = Path.of(value).toAbsolutePath().normalize();
            } catch (InvalidPathException ex) {
                results.add(new ProbeResult(value, value, 0, "", 0, "路径无效"));
                continue;
            }
            String name = path.getFileName() == null ? value : path.getFileName().toString();
            if (!Files.isRegularFile(path)) {
                results.add(new ProbeResult(path.toString(), name, 0, "", 0, "文件不存在"));
                continue;
            }
            try {
                ConversionEngine.SourceInfo info = engine.probe(path);
                results.add(new ProbeResult(path.toString(), name, Files.size(path),
                        info.kind(), info.pages(), null));
            } catch (InvalidPasswordException ex) {
                results.add(new ProbeResult(path.toString(), name, sizeOf(path), "PDF", 0, "PDF 已加密，暂不支持"));
            } catch (IOException | RuntimeException ex) {
                log.debug("探测文件失败: {}", path, ex);
                results.add(new ProbeResult(path.toString(), name, sizeOf(path), "", 0,
                        "无法解析该文件（可能已损坏或格式不受支持）"));
            }
        }
        return results;
    }

    public List<ConversionJob> list(int limit) {
        int safeLimit = Math.max(1, Math.min(MAX_HISTORY, limit));
        synchronized (tasks) {
            List<ConversionTask> all = new ArrayList<>(tasks.values());
            List<ConversionJob> result = new ArrayList<>();
            for (int i = all.size() - 1; i >= 0 && result.size() < safeLimit; i--) {
                result.add(all.get(i).snapshot());
            }
            return result;
        }
    }

    public ConversionJob cancel(String id) {
        ConversionTask task = require(id);
        if (task.status().terminal()) {
            return task.snapshot();
        }
        task.requestCancel();
        if (task.status() == ConversionStatus.QUEUED) {
            var future = task.future();
            if (future != null && future.cancel(false)) {
                task.canceled();
            }
        } else {
            task.updateProgress(task.progress(), "正在取消…");
        }
        return task.snapshot();
    }

    private void run(ConversionTask task) {
        if (task.status() == ConversionStatus.CANCELED || task.cancelRequested()) {
            task.canceled();
            return;
        }
        task.markRunning();
        Path temp = tempPath(task);
        long startedAt = System.nanoTime();
        try {
            Files.deleteIfExists(temp);
            ConversionEngine.Progress progress = new ConversionEngine.Progress() {
                @Override
                public void update(int percent, String phase) {
                    task.updateProgress(percent, phase);
                }

                @Override
                public boolean canceled() {
                    return task.cancelRequested();
                }
            };
            ConversionEngine.ExportMode mode = ConversionEngine.ExportMode.VECTOR;
            boolean sharded = false;
            if ("PDF".equals(task.target())) {
                mode = engine.ofdToPdf(task.source(), temp, progress);
            } else {
                sharded = engine.pdfToOfd(task.source(), temp, progress);
            }
            task.updateProgress(92, "正在校验输出");
            long durationMs = (System.nanoTime() - startedAt) / 1_000_000;
            ConversionReport report = engine.verify(temp, task.target(), task.sourcePages(), durationMs, mode);
            if (sharded) {
                List<String> warnings = new ArrayList<>(report.warnings());
                warnings.add("大文档已按分片转换后合并，PDF 书签可能未保留");
                report = new ConversionReport(report.sourcePages(), report.outputPages(),
                        report.outputBytes(), report.durationMs(), List.copyOf(warnings));
            }
            task.updateProgress(96, "正在保存文件");
            moveIntoPlace(temp, task.output());
            task.succeed(report);
            log.info("转换完成: {} -> {}（{} 页，{} ms）",
                    task.source().getFileName(), task.output(), report.outputPages(), durationMs);
        } catch (ConversionCanceledException ex) {
            task.canceled();
            log.info("转换已取消: {}", task.source().getFileName());
        } catch (OutOfMemoryError error) {
            // OOM 是 Error，必须显式处理：否则任务永远停在 RUNNING，前端会一直等待
            log.error("转换内存不足: {}（{} 页）", task.source(), task.sourcePages(), error);
            task.fail("OUT_OF_MEMORY", "内存不足，无法转换该文档（" + task.sourcePages()
                    + " 页）；请拆分后重试，或关闭其他文档释放内存");
        } catch (InvalidPasswordException ex) {
            task.fail("PDF_ENCRYPTED", "PDF 已加密，暂不支持转换");
        } catch (ApiException ex) {
            task.fail(ex.getCode(), ex.getMessage());
        } catch (IOException | RuntimeException ex) {
            log.warn("转换失败: {}", task.source(), ex);
            String detail = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
            task.fail("CONVERSION_FAILED", "转换失败：" + detail);
        } catch (Throwable error) {
            log.error("转换异常终止: {}", task.source(), error);
            task.fail("CONVERSION_FAILED", "转换异常终止：" + error.getClass().getSimpleName());
        } finally {
            deleteQuietly(temp);
        }
    }

    private record ResolvedSource(Path path, String kind, int pages) {
    }

    private ResolvedSource resolveSource(ConversionRequest request) {
        String documentId = trimToNull(request.documentId());
        String rawPath = trimToNull(request.sourcePath());
        if (documentId != null) {
            DocumentSummary summary = documents.summary(documentId);
            return new ResolvedSource(Path.of(summary.path()).toAbsolutePath().normalize(),
                    summary.kind(), summary.pageCount());
        }
        if (rawPath == null) {
            throw new ApiException(Http.BAD_REQUEST, "SOURCE_REQUIRED", "请提供待转换的文档");
        }
        Path path = normalize(rawPath);
        if (!Files.exists(path)) {
            throw new ApiException(Http.NOT_FOUND, "FILE_NOT_FOUND", "文件不存在：" + path);
        }
        if (!Files.isRegularFile(path)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "目标不是文件：" + path);
        }
        try {
            ConversionEngine.SourceInfo info = engine.probe(path);
            return new ResolvedSource(path, info.kind(), info.pages());
        } catch (InvalidPasswordException ex) {
            throw new ApiException(Http.UNPROCESSABLE_ENTITY, "PDF_ENCRYPTED", "PDF 已加密，暂不支持转换");
        } catch (IOException | RuntimeException ex) {
            if (ex instanceof ApiException apiException) {
                throw apiException;
            }
            log.warn("转换源文件解析失败: {}", path, ex);
            throw new ApiException(Http.UNPROCESSABLE_ENTITY, "DOCUMENT_PARSE_ERROR",
                    "文档解析失败，文件可能损坏或包含暂不支持的特性", ex.getMessage());
        }
    }

    private String resolveTarget(String rawTarget, String sourceKind) {
        String target = trimToNull(rawTarget);
        if (target == null) {
            target = "PDF".equals(sourceKind) ? "OFD" : "PDF";
        }
        target = target.toUpperCase(Locale.ROOT);
        if (!"PDF".equals(target) && !"OFD".equals(target)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_TARGET", "目标格式仅支持 PDF 或 OFD");
        }
        if (target.equals(sourceKind)) {
            throw new ApiException(Http.BAD_REQUEST, "SAME_FORMAT", "源文档已经是 " + target + " 格式");
        }
        return target;
    }

    private Path resolveOutput(String rawOutput, String target, Path source, boolean overwrite) {
        String value = trimToNull(rawOutput);
        if (value == null) {
            throw new ApiException(Http.BAD_REQUEST, "OUTPUT_REQUIRED", "请提供输出文件路径");
        }
        Path output = normalize(value);
        String extension = "." + target.toLowerCase(Locale.ROOT);
        String name = output.getFileName().toString();
        if (!name.toLowerCase(Locale.ROOT).endsWith(extension)) {
            output = output.resolveSibling(name + extension);
        }
        if (output.equals(source)) {
            throw new ApiException(Http.BAD_REQUEST, "SOURCE_IS_OUTPUT", "输出文件不能与源文件相同");
        }
        if (Files.exists(source) && Files.exists(output)) {
            try {
                if (Files.isSameFile(output, source)) {
                    throw new ApiException(Http.BAD_REQUEST, "SOURCE_IS_OUTPUT", "输出文件不能与源文件相同");
                }
            } catch (IOException ex) {
                log.debug("比较源文件与输出文件失败", ex);
            }
        }
        Path parent = output.getParent();
        if (parent == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_OUTPUT_PATH", "输出路径无效");
        }
        if (!Files.isDirectory(parent)) {
            try {
                Files.createDirectories(parent);
            } catch (IOException ex) {
                throw new ApiException(Http.BAD_REQUEST, "INVALID_OUTPUT_PATH",
                        "无法创建输出目录：" + parent, ex.getMessage());
            }
        }
        if (Files.isDirectory(output)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_OUTPUT_PATH", "输出路径是目录：" + output);
        }
        if (Files.exists(output) && !overwrite) {
            throw new ApiException(Http.CONFLICT, "OUTPUT_EXISTS", "输出文件已存在：" + output);
        }
        if (Files.exists(output) && !Files.isWritable(output)) {
            throw new ApiException(Http.BAD_REQUEST, "OUTPUT_NOT_WRITABLE", "输出文件不可写：" + output);
        }
        return output;
    }

    private long sizeOf(Path path) {
        try {
            return Files.size(path);
        } catch (IOException ex) {
            return 0;
        }
    }

    private Path normalize(String rawPath) {
        try {
            return Path.of(rawPath).toAbsolutePath().normalize();
        } catch (InvalidPathException ex) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "文件路径无效", ex.getMessage());
        }
    }

    private Path tempPath(ConversionTask task) {
        Path output = task.output();
        String name = output.getFileName().toString();
        String base = name.replaceFirst("\\.[^.]+$", "");
        String extension = name.substring(base.length());
        String suffix = task.id().substring(0, 8);
        return output.resolveSibling("." + base + TEMP_MARK + suffix + extension);
    }

    private void moveIntoPlace(Path temp, Path output) throws IOException {
        try {
            Files.move(temp, output, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(temp, output, StandardCopyOption.REPLACE_EXISTING);
        } catch (FileSystemException ex) {
            throw new IOException("无法写入输出文件，可能正被其他程序占用：" + output, ex);
        }
    }

    private void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            log.warn("清理转换临时文件失败: {}", path, ex);
        }
    }

    private void trimHistory() {
        while (tasks.size() >= MAX_HISTORY) {
            var iterator = tasks.entrySet().iterator();
            boolean removed = false;
            while (iterator.hasNext()) {
                var entry = iterator.next();
                if (entry.getValue().status().terminal()) {
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

    private ConversionTask require(String id) {
        synchronized (tasks) {
            ConversionTask task = tasks.get(id);
            if (task == null) {
                throw new ApiException(Http.NOT_FOUND, "JOB_NOT_FOUND", "转换任务不存在");
            }
            return task;
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

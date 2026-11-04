package com.adou.ofd.merge;

import com.adou.ofd.convert.ConversionCanceledException;
import com.adou.ofd.convert.ConversionEngine;
import com.adou.ofd.convert.ConversionReport;
import com.adou.ofd.convert.ConversionStatus;
import com.adou.ofd.convert.HeavyTaskExecutor;
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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;

/**
 * 合并任务调度：与转换共用单工作线程，避免两类大任务同时运行时争抢内存。
 *
 * <p>输出先写入同目录临时文件，校验页数后原子替换；源文件只读。
 */
public class MergeService {

    private static final Logger log = LoggerFactory.getLogger(MergeService.class);
    private static final int MAX_FILES = 100;
    private static final int MAX_HISTORY = 20;
    private static final String TEMP_MARK = ".adou-merge-";

    private final ConversionEngine conversions;
    private final MergeEngine mergeEngine;
    private final HeavyTaskExecutor executor;
    private final Map<String, MergeTask> tasks = new LinkedHashMap<>();

    public MergeService(ConversionEngine conversions, MergeEngine mergeEngine, HeavyTaskExecutor executor) {
        this.conversions = conversions;
        this.mergeEngine = mergeEngine;
        this.executor = executor;
    }

    public MergeJob submit(MergeRequest request) {
        if (request == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_REQUEST", "请提供合并参数");
        }
        List<String> rawFiles = request.files();
        if (rawFiles == null || rawFiles.isEmpty()) {
            throw new ApiException(Http.BAD_REQUEST, "FILES_REQUIRED", "请提供待合并的文件");
        }
        if (rawFiles.size() < 2) {
            throw new ApiException(Http.BAD_REQUEST, "NEED_TWO_FILES", "至少需要 2 个文件才能合并");
        }
        if (rawFiles.size() > MAX_FILES) {
            throw new ApiException(Http.BAD_REQUEST, "TOO_MANY_FILES",
                    "一次最多合并 " + MAX_FILES + " 个文件");
        }
        String target = resolveTarget(request.target());
        String pdfMode = "PDF".equals(target) ? resolvePdfMode(request.pdfMode()) : "AUTO";
        List<Path> files = new ArrayList<>(rawFiles.size());
        for (String raw : rawFiles) {
            files.add(resolveInput(raw));
        }
        Path output = resolveOutput(request.outputPath(), target, files,
                Boolean.TRUE.equals(request.overwrite()));

        MergeTask task = new MergeTask(UUID.randomUUID().toString(), files, target, pdfMode, output);
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
            throw new ApiException(Http.TOO_MANY_REQUESTS, "MERGE_QUEUE_FULL",
                    "合并队列已满，请等待当前任务完成后再试");
        }
        return task.snapshot();
    }

    public MergeJob get(String id) {
        return require(id).snapshot();
    }

    public List<MergeJob> list(int limit) {
        int safeLimit = Math.max(1, Math.min(MAX_HISTORY, limit));
        synchronized (tasks) {
            List<MergeTask> all = new ArrayList<>(tasks.values());
            List<MergeJob> result = new ArrayList<>();
            for (int i = all.size() - 1; i >= 0 && result.size() < safeLimit; i--) {
                result.add(all.get(i).snapshot());
            }
            return result;
        }
    }

    public MergeJob cancel(String id) {
        MergeTask task = require(id);
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

    private void run(MergeTask task) {
        if (task.status() == ConversionStatus.CANCELED || task.cancelRequested()) {
            task.canceled();
            return;
        }
        task.markRunning();
        Path temp = tempPath(task);
        Path workDir = null;
        long startedAt = System.nanoTime();
        try {
            Files.deleteIfExists(temp);
            workDir = Files.createTempDirectory("adou-merge-work-");
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
            MergeEngine.MergeResult result = mergeEngine.merge(
                    task.files(), task.target(), task.pdfMode(), temp, workDir, progress);

            task.updateProgress(94, "正在校验合并结果");
            long durationMs = (System.nanoTime() - startedAt) / 1_000_000;
            ConversionReport verified = conversions.verify(
                    temp, task.target(), result.sourcePages(), durationMs, result.mode());
            List<String> warnings = new ArrayList<>(result.warnings());
            for (String warning : verified.warnings()) {
                if (!warnings.contains(warning)) {
                    warnings.add(warning);
                }
            }
            MergeReport report = new MergeReport(
                    task.files().size(),
                    verified.sourcePages(),
                    verified.outputPages(),
                    verified.outputBytes(),
                    durationMs,
                    List.copyOf(warnings));

            task.updateProgress(97, "正在保存文件");
            moveIntoPlace(temp, task.output());
            task.succeed(report);
            log.info("合并完成: {} 个文件 -> {}（{} 页，{} ms）",
                    task.files().size(), task.output(), report.outputPages(), durationMs);
        } catch (ConversionCanceledException ex) {
            task.canceled();
            log.info("合并已取消: {} 个文件 -> {}", task.files().size(), task.output());
        } catch (OutOfMemoryError error) {
            log.error("合并内存不足: {} 个文件 -> {}", task.files().size(), task.output(), error);
            task.fail("OUT_OF_MEMORY", "内存不足，无法合并这些文档；请减少文件数量或拆分后重试");
        } catch (InvalidPasswordException ex) {
            task.fail("PDF_ENCRYPTED", "PDF 已加密，暂不支持合并");
        } catch (ApiException ex) {
            task.fail(ex.getCode(), ex.getMessage());
        } catch (IOException | RuntimeException ex) {
            log.warn("合并失败: {} 个文件 -> {}", task.files().size(), task.output(), ex);
            String detail = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
            task.fail("MERGE_FAILED", "合并失败：" + detail);
        } catch (Throwable error) {
            log.error("合并异常终止: {} 个文件 -> {}", task.files().size(), task.output(), error);
            task.fail("MERGE_FAILED", "合并异常终止：" + error.getClass().getSimpleName());
        } finally {
            deleteQuietly(temp);
            deleteRecursively(workDir);
        }
    }

    private String resolveTarget(String rawTarget) {
        String target = trimToNull(rawTarget);
        if (target == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_TARGET", "请选择输出格式（PDF 或 OFD）");
        }
        target = target.toUpperCase(Locale.ROOT);
        if (!"PDF".equals(target) && !"OFD".equals(target)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_TARGET", "输出格式仅支持 PDF 或 OFD");
        }
        return target;
    }

    private String resolvePdfMode(String raw) {
        String mode = trimToNull(raw);
        if (mode == null) {
            return "AUTO";
        }
        mode = mode.toUpperCase(Locale.ROOT);
        return switch (mode) {
            case "AUTO", "VECTOR", "IMAGE" -> mode;
            default -> throw new ApiException(Http.BAD_REQUEST, "INVALID_PDF_MODE",
                    "PDF 模式仅支持 AUTO、VECTOR 或 IMAGE");
        };
    }

    private Path resolveInput(String raw) {
        String value = trimToNull(raw);
        if (value == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "文件路径为空");
        }
        Path path = normalize(value);
        if (!Files.exists(path)) {
            throw new ApiException(Http.NOT_FOUND, "FILE_NOT_FOUND", "文件不存在：" + path);
        }
        if (!Files.isRegularFile(path)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "不是文件：" + path);
        }
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!name.endsWith(".ofd") && !name.endsWith(".pdf")) {
            throw new ApiException(Http.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FORMAT",
                    "仅支持合并 .ofd 与 .pdf 文件");
        }
        return path;
    }

    private Path resolveOutput(String rawOutput, String target, List<Path> inputs, boolean overwrite) {
        String value = trimToNull(rawOutput);
        if (value == null) {
            throw new ApiException(Http.BAD_REQUEST, "OUTPUT_REQUIRED", "请提供输出文件路径");
        }
        Path output = normalize(value);
        String extension = "." + target.toLowerCase(Locale.ROOT);
        String name = output.getFileName().toString();
        String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(extension)) {
            if (lower.endsWith(".ofd") || lower.endsWith(".pdf")) {
                output = output.resolveSibling(name.substring(0, name.lastIndexOf('.')) + extension);
            } else {
                output = output.resolveSibling(name + extension);
            }
        }
        for (Path input : inputs) {
            if (isSamePath(output, input)) {
                throw new ApiException(Http.BAD_REQUEST, "SOURCE_IS_OUTPUT",
                        "输出文件不能与任一待合并文件相同");
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

    private boolean isSamePath(Path output, Path input) {
        if (output.equals(input)) {
            return true;
        }
        try {
            return Files.exists(output) && Files.exists(input) && Files.isSameFile(output, input);
        } catch (IOException ex) {
            return false;
        }
    }

    private Path normalize(String rawPath) {
        try {
            return Path.of(rawPath).toAbsolutePath().normalize();
        } catch (InvalidPathException ex) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "文件路径无效", ex.getMessage());
        }
    }

    private Path tempPath(MergeTask task) {
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

    private void deleteRecursively(Path path) {
        if (path == null || !Files.exists(path)) {
            return;
        }
        try (var stream = Files.walk(path)) {
            stream.sorted(Comparator.reverseOrder()).forEach(this::deleteQuietly);
        } catch (IOException ex) {
            log.warn("清理合并临时目录失败: {}", path, ex);
        }
    }

    private void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            log.warn("清理合并临时文件失败: {}", path, ex);
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

    private MergeTask require(String id) {
        synchronized (tasks) {
            MergeTask task = tasks.get(id);
            if (task == null) {
                throw new ApiException(Http.NOT_FOUND, "JOB_NOT_FOUND", "合并任务不存在");
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

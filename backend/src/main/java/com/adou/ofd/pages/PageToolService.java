package com.adou.ofd.pages;

import com.adou.ofd.convert.ConversionCanceledException;
import com.adou.ofd.convert.ConversionEngine;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;

/**
 * 拆分/插页任务调度：与转换、合并共用单工作线程，避免大任务同时争抢内存。
 *
 * <p>拆分结果先写入临时目录，全部校验通过后再移动到输出目录；插页结果先写同目录临时文件，
 * 校验页数后原子替换。用户源文件只读。
 */
public class PageToolService {

    private static final Logger log = LoggerFactory.getLogger(PageToolService.class);
    private static final int MAX_OUTPUTS = 300;
    private static final int MAX_PAGES_PER_FILE = 999;
    private static final int MAX_HISTORY = 20;
    private static final String TEMP_MARK = ".adou-pages-";
    private static final Set<String> RESERVED_NAMES = Set.of(
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9");

    private final ConversionEngine conversions;
    private final PageToolEngine engine;
    private final HeavyTaskExecutor executor;
    private final Map<String, PageToolTask> tasks = new LinkedHashMap<>();

    public PageToolService(ConversionEngine conversions, PageToolEngine engine,
                           HeavyTaskExecutor executor) {
        this.conversions = conversions;
        this.engine = engine;
        this.executor = executor;
    }

    public PageToolJob submitSplit(SplitRequest request) {
        if (request == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_REQUEST", "请提供拆分参数");
        }
        Path source = resolveInput(request.sourcePath(), "请提供要拆分的文档");
        ConversionEngine.SourceInfo info = probeInput(source);
        String mode = resolveSplitMode(request.mode());
        List<List<Integer>> groups = switch (mode) {
            case "PAGE" -> singlePageGroups(info.pages());
            case "CHUNK" -> chunkGroups(resolvePagesPerFile(request.pagesPerFile()), info.pages());
            default -> resolveRangeGroups(request.ranges(), info.pages());
        };
        if (groups.isEmpty()) {
            throw new ApiException(Http.BAD_REQUEST, "NO_PAGES", "没有可拆分的内容");
        }
        if (groups.size() > MAX_OUTPUTS) {
            throw new ApiException(Http.BAD_REQUEST, "TOO_MANY_OUTPUTS",
                    "一次最多生成 " + MAX_OUTPUTS + " 个文件，请改用每 N 页或按区间拆分");
        }
        Path outputDir = resolveOutputDir(request.outputDir());
        String baseName = sanitizeBaseName(request.baseName(), source);
        String extension = "." + info.kind().toLowerCase(Locale.ROOT);
        int width = Math.max(2, Integer.toString(info.pages()).length());
        Set<String> used = new HashSet<>();
        List<SplitPlan> plans = new ArrayList<>(groups.size());
        for (List<Integer> group : groups) {
            String label = PageRanges.label(group, width);
            Path target = uniqueTarget(outputDir, baseName + "_" + label, extension, used);
            plans.add(new SplitPlan(group, target));
        }

        PageToolTask task = PageToolTask.split(
                UUID.randomUUID().toString(), source, info.kind(), info.pages(), plans, outputDir);
        submit(task);
        return task.snapshot();
    }

    public PageToolJob submitInsert(InsertRequest request) {
        if (request == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_REQUEST", "请提供插页参数");
        }
        Path base = resolveInput(request.basePath(), "请提供要插入页面的主文档");
        Path insert = resolveInput(request.insertPath(), "请提供插入文档");
        ConversionEngine.SourceInfo baseInfo = probeInput(base);
        ConversionEngine.SourceInfo insertInfo = probeInput(insert);
        if (baseInfo.pages() <= 0) {
            throw new ApiException(Http.BAD_REQUEST, "NO_PAGES", "主文档不包含任何页面");
        }
        if (insertInfo.pages() <= 0) {
            throw new ApiException(Http.BAD_REQUEST, "NO_PAGES", "插入文档不包含任何页面");
        }
        List<Integer> pages = trimToNull(request.insertRanges()) == null
                ? allPages(insertInfo.pages())
                : PageRanges.pages(request.insertRanges(), insertInfo.pages());
        if (pages.isEmpty()) {
            throw new ApiException(Http.BAD_REQUEST, "NO_PAGES", "请选择要插入的页面");
        }
        int position = resolvePosition(request.positionMode(), request.position(), baseInfo.pages());
        Path output = resolveOutput(request.outputPath(), baseInfo.kind(),
                List.of(base, insert), Boolean.TRUE.equals(request.overwrite()));

        PageToolTask task = PageToolTask.insert(
                UUID.randomUUID().toString(),
                base,
                baseInfo.kind(),
                baseInfo.pages(),
                insert,
                insertInfo.kind(),
                insertInfo.pages(),
                pages,
                position,
                output,
                Boolean.TRUE.equals(request.overwrite()));
        submit(task);
        return task.snapshot();
    }

    public PageToolJob get(String id) {
        return require(id).snapshot();
    }

    public List<PageToolJob> list(int limit) {
        int safeLimit = Math.max(1, Math.min(MAX_HISTORY, limit));
        synchronized (tasks) {
            List<PageToolTask> all = new ArrayList<>(tasks.values());
            List<PageToolJob> result = new ArrayList<>();
            for (int index = all.size() - 1; index >= 0 && result.size() < safeLimit; index--) {
                result.add(all.get(index).snapshot());
            }
            return result;
        }
    }

    public PageToolJob cancel(String id) {
        PageToolTask task = require(id);
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

    private void submit(PageToolTask task) {
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
            throw new ApiException(Http.TOO_MANY_REQUESTS, "PAGE_TOOL_QUEUE_FULL",
                    "拆分/插页队列已满，请等待当前任务完成后再试");
        }
    }

    private void run(PageToolTask task) {
        if (task.status() == ConversionStatus.CANCELED || task.cancelRequested()) {
            task.canceled();
            return;
        }
        task.markRunning();
        Path workDir = null;
        try {
            workDir = Files.createTempDirectory("adou-pages-work-");
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
            if ("SPLIT".equals(task.operation())) {
                runSplit(task, workDir, progress);
            } else {
                runInsert(task, workDir, progress);
            }
        } catch (ConversionCanceledException ex) {
            task.canceled();
            log.info("{}任务已取消: {}（{} 页）", task.operation(),
                    task.source().getFileName(), task.sourcePages());
        } catch (OutOfMemoryError error) {
            log.error("{}任务内存不足: {}（{} 页）", task.operation(), task.source(),
                    task.sourcePages(), error);
            task.fail("OUT_OF_MEMORY", "内存不足，无法完成拆分/插页；请减少页数后重试");
        } catch (InvalidPasswordException ex) {
            task.fail("PDF_ENCRYPTED", "PDF 已加密，暂不支持拆分/插页");
        } catch (ApiException ex) {
            task.fail(ex.getCode(), ex.getMessage());
        } catch (IOException | RuntimeException ex) {
            log.warn("{}任务失败: {}", task.operation(), task.source(), ex);
            String detail = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
            task.fail("PAGE_TOOL_FAILED",
                    ("SPLIT".equals(task.operation()) ? "拆分失败：" : "插入失败：") + detail);
        } catch (Throwable error) {
            log.error("{}任务异常终止: {}", task.operation(), task.source(), error);
            task.fail("PAGE_TOOL_FAILED",
                    ("SPLIT".equals(task.operation()) ? "拆分异常终止：" : "插入异常终止：")
                            + error.getClass().getSimpleName());
        } finally {
            deleteRecursively(workDir);
        }
    }

    private void runSplit(PageToolTask task, Path workDir, ConversionEngine.Progress progress)
            throws IOException {
        long startedAt = System.nanoTime();
        PageToolEngine.SplitResult result = engine.split(
                task.source(), task.sourceKind(), task.splitPlans(), workDir, progress);

        task.updateProgress(90, "正在校验拆分结果");
        int outputPages = 0;
        long outputBytes = 0;
        for (PageToolEngine.GeneratedOutput output : result.outputs()) {
            if (task.cancelRequested()) {
                throw new ConversionCanceledException();
            }
            ConversionEngine.SourceInfo info = conversions.probe(output.temp());
            if (info.pages() != output.pages()) {
                throw new IOException("拆分结果页数不一致：" + output.target().getFileName()
                        + " 应为 " + output.pages() + " 页，实际 " + info.pages() + " 页");
            }
            outputPages += info.pages();
            outputBytes += Files.size(output.temp());
        }

        task.updateProgress(95, "正在保存文件");
        Set<String> used = new HashSet<>();
        for (SplitPlan plan : task.splitPlans()) {
            used.add(plan.target().toString().toLowerCase(Locale.ROOT));
        }
        List<PageOutput> published = new ArrayList<>();
        try {
            for (PageToolEngine.GeneratedOutput output : result.outputs()) {
                Path target = output.target();
                if (Files.exists(target)) {
                    String name = target.getFileName().toString();
                    String extension = name.substring(name.lastIndexOf('.'));
                    String base = name.substring(0, name.lastIndexOf('.'));
                    target = uniqueTarget(target.getParent(), base, extension, used);
                }
                moveIntoPlace(output.temp(), target);
                published.add(new PageOutput(
                        target.toString(), target.getFileName().toString(), output.pages()));
            }
        } catch (IOException ex) {
            for (PageOutput output : published) {
                deleteQuietly(Path.of(output.path()));
            }
            throw ex;
        }
        long durationMs = (System.nanoTime() - startedAt) / 1_000_000;
        task.succeed(published, outputPages, outputBytes, result.warnings());
        log.info("拆分完成: {} -> {} 个文件（{} 页，{} ms）",
                task.source().getFileName(), published.size(), outputPages, durationMs);
    }

    private void runInsert(PageToolTask task, Path workDir, ConversionEngine.Progress progress)
            throws IOException {
        long startedAt = System.nanoTime();
        Path temp = tempPath(task);
        try {
            Files.deleteIfExists(temp);
            PageToolEngine.InsertResult result = engine.insert(
                    task.source(), task.sourceKind(), task.sourcePages(),
                    task.insertSource(), task.insertKind(), task.insertPages(),
                    task.position(), temp, workDir, progress);

            task.updateProgress(95, "正在校验插入结果");
            ConversionEngine.SourceInfo info = conversions.probe(temp);
            int expected = task.sourcePages() + task.insertPages().size();
            if (info.pages() != expected) {
                throw new IOException("插入结果页数不一致：应为 " + expected
                        + " 页，实际 " + info.pages() + " 页");
            }
            if (!task.overwrite() && Files.exists(task.output())) {
                throw new ApiException(Http.CONFLICT, "OUTPUT_EXISTS",
                        "输出文件已存在：" + task.output());
            }
            long outputBytes = Files.size(temp);
            task.updateProgress(98, "正在保存文件");
            moveIntoPlace(temp, task.output());
            PageOutput output = new PageOutput(
                    task.output().toString(), task.output().getFileName().toString(), info.pages());
            task.succeed(List.of(output), info.pages(), outputBytes, result.warnings());
            long durationMs = (System.nanoTime() - startedAt) / 1_000_000;
            log.info("插页完成: {} + {}（{} 页，{} ms）", task.source().getFileName(),
                    task.insertSource().getFileName(), info.pages(), durationMs);
        } finally {
            deleteQuietly(temp);
        }
    }

    private ConversionEngine.SourceInfo probeInput(Path path) {
        try {
            return conversions.probe(path);
        } catch (InvalidPasswordException ex) {
            throw new ApiException(Http.UNPROCESSABLE_ENTITY, "PDF_ENCRYPTED",
                    "PDF 已加密，暂不支持拆分/插页");
        } catch (IOException | RuntimeException ex) {
            if (ex instanceof ApiException apiException) {
                throw apiException;
            }
            log.warn("拆分/插页源文件解析失败: {}", path, ex);
            throw new ApiException(Http.UNPROCESSABLE_ENTITY, "DOCUMENT_PARSE_ERROR",
                    "文档解析失败，文件可能损坏或包含暂不支持的特性", ex.getMessage());
        }
    }

    private Path resolveInput(String raw, String emptyMessage) {
        String value = trimToNull(raw);
        if (value == null) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", emptyMessage);
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
                    "仅支持 .ofd 与 .pdf 文件");
        }
        return path;
    }

    private Path resolveOutputDir(String raw) {
        String value = trimToNull(raw);
        if (value == null) {
            throw new ApiException(Http.BAD_REQUEST, "OUTPUT_DIR_REQUIRED", "请选择输出目录");
        }
        Path dir = normalize(value);
        if (Files.exists(dir) && !Files.isDirectory(dir)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_OUTPUT_DIR", "输出路径不是目录：" + dir);
        }
        try {
            Files.createDirectories(dir);
        } catch (IOException ex) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_OUTPUT_DIR",
                    "无法创建输出目录：" + dir, ex.getMessage());
        }
        if (!Files.isWritable(dir)) {
            throw new ApiException(Http.BAD_REQUEST, "OUTPUT_NOT_WRITABLE", "输出目录不可写：" + dir);
        }
        return dir;
    }

    private Path resolveOutput(String rawOutput, String kind, List<Path> inputs, boolean overwrite) {
        String value = trimToNull(rawOutput);
        if (value == null) {
            throw new ApiException(Http.BAD_REQUEST, "OUTPUT_REQUIRED", "请提供输出文件路径");
        }
        Path output = normalize(value);
        String extension = "." + kind.toLowerCase(Locale.ROOT);
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
                        "输出文件不能与源文件相同");
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

    private String resolveSplitMode(String raw) {
        String value = trimToNull(raw);
        if (value == null) {
            return "PAGE";
        }
        String mode = value.toUpperCase(Locale.ROOT);
        if (!"PAGE".equals(mode) && !"CHUNK".equals(mode) && !"RANGES".equals(mode)) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_SPLIT_MODE",
                    "拆分方式仅支持按页、每 N 页或按区间");
        }
        return mode;
    }

    private int resolvePagesPerFile(Integer value) {
        if (value == null || value < 1 || value > MAX_PAGES_PER_FILE) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_CHUNK_SIZE",
                    "每组页数应在 1-" + MAX_PAGES_PER_FILE + " 之间");
        }
        return value;
    }

    private List<List<Integer>> resolveRangeGroups(String raw, int pageCount) {
        if (trimToNull(raw) == null) {
            throw new ApiException(Http.BAD_REQUEST, "RANGES_REQUIRED", "请填写页码范围");
        }
        return PageRanges.groups(raw, pageCount);
    }

    private List<List<Integer>> singlePageGroups(int pageCount) {
        List<List<Integer>> groups = new ArrayList<>(pageCount);
        for (int page = 1; page <= pageCount; page++) {
            groups.add(List.of(page));
        }
        return groups;
    }

    private List<List<Integer>> chunkGroups(int pagesPerFile, int pageCount) {
        List<List<Integer>> groups = new ArrayList<>();
        for (int start = 1; start <= pageCount; start += pagesPerFile) {
            int end = Math.min(pageCount, start + pagesPerFile - 1);
            List<Integer> pages = new ArrayList<>(end - start + 1);
            for (int page = start; page <= end; page++) {
                pages.add(page);
            }
            groups.add(List.copyOf(pages));
        }
        return groups;
    }

    private int resolvePosition(String rawMode, Integer rawPosition, int basePages) {
        String mode = trimToNull(rawMode);
        if (mode == null) {
            mode = "END";
        }
        String normalized = mode.toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "START" -> 0;
            case "END" -> basePages;
            case "BEFORE" -> {
                if (rawPosition == null || rawPosition < 1 || rawPosition > basePages) {
                    throw new ApiException(Http.BAD_REQUEST, "INVALID_POSITION",
                            "插入位置应在 1-" + basePages + " 页之间");
                }
                yield rawPosition - 1;
            }
            default -> throw new ApiException(Http.BAD_REQUEST, "INVALID_POSITION",
                    "插入位置仅支持文档开头、指定页前或文档末尾");
        };
    }

    private List<Integer> allPages(int pageCount) {
        List<Integer> pages = new ArrayList<>(pageCount);
        for (int page = 1; page <= pageCount; page++) {
            pages.add(page);
        }
        return List.copyOf(pages);
    }

    private String sanitizeBaseName(String raw, Path source) {
        String value = trimToNull(raw);
        if (value == null) {
            String name = source.getFileName().toString();
            value = name.replaceFirst("\\.[^.]+$", "");
        }
        value = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        value = value.replaceAll("[. ]+$", "");
        if (value.isBlank()) {
            value = "阿豆OFD-拆分";
        }
        if (RESERVED_NAMES.contains(value.toUpperCase(Locale.ROOT))) {
            value = "_" + value;
        }
        if (value.length() > 80) {
            value = value.substring(0, 80);
            value = value.replaceAll("[. ]+$", "");
        }
        return value;
    }

    private Path uniqueTarget(Path dir, String base, String extension, Set<String> used) {
        Path candidate = dir.resolve(base + extension);
        int index = 2;
        while (used.contains(candidate.toString().toLowerCase(Locale.ROOT)) || Files.exists(candidate)) {
            candidate = dir.resolve(base + "-" + index + extension);
            index++;
        }
        used.add(candidate.toString().toLowerCase(Locale.ROOT));
        return candidate;
    }

    private Path tempPath(PageToolTask task) {
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

    private void deleteRecursively(Path path) {
        if (path == null || !Files.exists(path)) {
            return;
        }
        try (var stream = Files.walk(path)) {
            stream.sorted(Comparator.reverseOrder()).forEach(this::deleteQuietly);
        } catch (IOException ex) {
            log.warn("清理拆分/插页临时目录失败: {}", path, ex);
        }
    }

    private void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            log.warn("清理拆分/插页临时文件失败: {}", path, ex);
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

    private PageToolTask require(String id) {
        synchronized (tasks) {
            PageToolTask task = tasks.get(id);
            if (task == null) {
                throw new ApiException(Http.NOT_FOUND, "JOB_NOT_FOUND", "拆分/插页任务不存在");
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

package com.adou.ofd.document;

import com.adou.ofd.web.ApiException;
import jakarta.annotation.PreDestroy;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class DocumentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentService.class);
    private static final int MAX_SESSIONS = 8;

    private final DemoOfdFactory demoFactory;
    private final PdfDemoFactory pdfDemoFactory;
    private final Map<String, DocumentSession> sessions = new LinkedHashMap<>(16, 0.75f, true);

    public DocumentService(DemoOfdFactory demoFactory, PdfDemoFactory pdfDemoFactory) {
        this.demoFactory = demoFactory;
        this.pdfDemoFactory = pdfDemoFactory;
    }

    public synchronized DocumentSummary open(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PATH", "请提供 OFD 或 PDF 文件路径");
        }
        Path path;
        try {
            path = Path.of(rawPath).toAbsolutePath().normalize();
        } catch (InvalidPathException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PATH", "文件路径无效", ex.getMessage());
        }
        if (!Files.exists(path)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND", "文件不存在：" + path);
        }
        if (!Files.isRegularFile(path)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PATH", "目标不是文件：" + path);
        }
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!fileName.endsWith(".ofd") && !fileName.endsWith(".pdf")) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_FORMAT",
                    "当前支持打开 .ofd 和 .pdf 文件");
        }

        Path workDir = createWorkDir();
        try {
            DocumentSession session = loadSession(path, workDir, false);
            register(session);
            return session.summary();
        } catch (RuntimeException | IOException ex) {
            deleteRecursively(workDir);
            throw parseFailure(ex);
        }
    }

    public synchronized DocumentSummary openDemo() {
        Path workDir = createWorkDir();
        try {
            Path demoPath = demoFactory.generate(workDir);
            DocumentSession session = loadSession(demoPath, workDir, true);
            register(session);
            return session.summary();
        } catch (RuntimeException | IOException ex) {
            deleteRecursively(workDir);
            throw parseFailure(ex);
        }
    }

    public synchronized DocumentSummary openPdfDemo() {
        Path workDir = createWorkDir();
        try {
            Path demoPath = pdfDemoFactory.generate(workDir);
            DocumentSession session = loadSession(demoPath, workDir, true);
            register(session);
            return session.summary();
        } catch (RuntimeException | IOException ex) {
            deleteRecursively(workDir);
            throw parseFailure(ex);
        }
    }

    public synchronized DocumentSummary summary(String id) {
        return require(id).summary();
    }

    public synchronized List<OutlineItem> outline(String id) {
        return require(id).handle().outline();
    }

    public synchronized List<TextRun> pageText(String id, int page) {
        DocumentSession session = require(id);
        if (page < 1 || page > session.pageCount()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PAGE_OUT_OF_RANGE",
                    "页码超出范围（1-" + session.pageCount() + "）");
        }
        try {
            return session.handle().pageText(page);
        } catch (IOException | RuntimeException ex) {
            log.warn("文本提取失败: document={}, page={}", id, page, ex);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TEXT_EXTRACT_FAILED",
                    "页面文本提取失败", ex.getMessage());
        }
    }

    public synchronized Path render(String id, int page, int dpi) {
        DocumentSession session = require(id);
        if (page < 1 || page > session.pageCount()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PAGE_OUT_OF_RANGE",
                    "页码超出范围（1-" + session.pageCount() + "）");
        }
        int safeDpi = Math.min(300, Math.max(24, dpi));

        try {
            Path png = session.handle().render(page, safeDpi);
            if (!isUsable(png)) {
                throw new IOException("渲染结果为空");
            }
            return png;
        } catch (IOException | RuntimeException ex) {
            log.warn("页面渲染失败: document={}, page={}, dpi={}", id, page, safeDpi, ex);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "RENDER_FAILED",
                    "页面渲染失败，请查看引擎日志", ex.getMessage());
        } catch (StackOverflowError error) {
            log.error("页面渲染栈溢出: document={}, page={}, dpi={}", id, page, safeDpi);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "RENDER_OVERFLOW",
                    "页面包含异常的资源引用，暂时无法渲染", "文档渲染递归溢出");
        }
    }

    public synchronized void close(String id) {
        DocumentSession removed = sessions.remove(id);
        if (removed != null) {
            closeSession(removed);
        }
    }

    @PreDestroy
    public synchronized void closeAll() {
        sessions.values().forEach(this::closeSession);
        sessions.clear();
    }

    private void closeSession(DocumentSession session) {
        if (session.handle() != null) {
            try {
                session.handle().close();
            } catch (IOException ex) {
                log.warn("关闭文档失败: {}", session.path(), ex);
            }
        }
        deleteRecursively(session.workDir());
    }

    private boolean isUsable(Path file) {
        try {
            return Files.isRegularFile(file) && Files.size(file) > 0;
        } catch (IOException ex) {
            return false;
        }
    }

    private DocumentSession loadSession(Path path, Path workDir, boolean demo) throws IOException {
        String fileName = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".pdf")) {
            return loadPdfSession(path, workDir, demo);
        }
        return loadOfdSession(path, workDir, demo);
    }

    private DocumentSession loadPdfSession(Path path, Path workDir, boolean demo) throws IOException {
        DocumentHandle handle = null;
        try {
            handle = PdfDocumentHandle.open(path, workDir);
            return new DocumentSession(
                    UUID.randomUUID().toString(),
                    path.getFileName().toString(),
                    path,
                    Files.size(path),
                    "PDF",
                    handle.pageCount(),
                    handle.signed(),
                    handle.pages(),
                    workDir,
                    demo,
                    handle);
        } catch (InvalidPasswordException ex) {
            closeHandleQuietly(handle);
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PDF_ENCRYPTED",
                    "PDF 已加密，暂不支持打开");
        } catch (IOException | RuntimeException ex) {
            closeHandleQuietly(handle);
            throw ex;
        }
    }

    private DocumentSession loadOfdSession(Path path, Path workDir, boolean demo) throws IOException {
        DocumentHandle handle = null;
        try {
            handle = OfdDocumentHandle.open(path, workDir);
            return new DocumentSession(
                    UUID.randomUUID().toString(),
                    path.getFileName().toString(),
                    path,
                    Files.size(path),
                    "OFD",
                    handle.pageCount(),
                    handle.signed(),
                    handle.pages(),
                    workDir,
                    demo,
                    handle);
        } catch (IOException | RuntimeException ex) {
            closeHandleQuietly(handle);
            throw ex;
        }
    }

    private void closeHandleQuietly(DocumentHandle handle) {
        if (handle == null) {
            return;
        }
        try {
            handle.close();
        } catch (IOException ex) {
            log.warn("关闭文档句柄失败", ex);
        }
    }

    private void register(DocumentSession session) {
        while (sessions.size() >= MAX_SESSIONS) {
            var eldest = sessions.entrySet().iterator().next();
            sessions.remove(eldest.getKey());
            closeSession(eldest.getValue());
        }
        sessions.put(session.id(), session);
    }

    private DocumentSession require(String id) {
        DocumentSession session = sessions.get(id);
        if (session == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND", "文档会话不存在或已关闭");
        }
        return session;
    }

    private Path createWorkDir() {
        try {
            return Files.createTempDirectory("adou-doc-");
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TEMP_DIR_FAILED", "无法创建临时目录", ex.getMessage());
        }
    }

    private ApiException parseFailure(Exception ex) {
        if (ex instanceof ApiException apiException) {
            return apiException;
        }
        log.warn("文档解析失败", ex);
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DOCUMENT_PARSE_ERROR",
                "文档解析失败，文件可能损坏、加密或包含暂不支持的特性", ex.getMessage());
    }

    private void deleteRecursively(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ex) {
                    log.warn("清理临时文件失败: {}", path, ex);
                }
            });
        } catch (IOException ex) {
            log.warn("清理临时目录失败: {}", dir, ex);
        }
    }
}

package com.adou.ofd.document;

import com.adou.ofd.web.ApiException;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.time.Duration;

/**
 * 拆分/插页页面预览：使用独立会话，不占用阅读器标签的文档会话。
 */
@RestController
@RequestMapping("/api/previews")
public class PreviewController {

    private final DocumentService documents;

    public PreviewController(DocumentService documents) {
        this.documents = documents;
    }

    @PostMapping
    public DocumentSummary open(@RequestBody(required = false) OpenRequest request) {
        if (request == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PATH", "请提供 OFD 或 PDF 文件路径");
        }
        return documents.openPreview(request.path());
    }

    @GetMapping("/{id}/pages/{page}")
    public ResponseEntity<Resource> page(
            @PathVariable String id,
            @PathVariable int page,
            @RequestParam(defaultValue = "24") int dpi) {
        Path png = documents.renderPreview(id, page, dpi);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .body(new FileSystemResource(png));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> close(@PathVariable String id) {
        documents.closePreview(id);
        return ResponseEntity.noContent().build();
    }
}

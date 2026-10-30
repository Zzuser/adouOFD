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
import java.util.List;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documents;

    public DocumentController(DocumentService documents) {
        this.documents = documents;
    }

    @PostMapping("/open")
    public DocumentSummary open(@RequestBody(required = false) OpenRequest request) {
        if (request == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PATH", "请提供 OFD 文件路径");
        }
        return documents.open(request.path());
    }

    @PostMapping("/demo")
    public DocumentSummary demo() {
        return documents.openDemo();
    }

    @PostMapping("/demo/pdf")
    public DocumentSummary pdfDemo() {
        return documents.openPdfDemo();
    }

    @GetMapping("/{id}")
    public DocumentSummary summary(@PathVariable String id) {
        return documents.summary(id);
    }

    @GetMapping("/{id}/outline")
    public List<OutlineItem> outline(@PathVariable String id) {
        return documents.outline(id);
    }

    @GetMapping("/{id}/pages/{page}")
    public ResponseEntity<Resource> page(
            @PathVariable String id,
            @PathVariable int page,
            @RequestParam(defaultValue = "144") int dpi) {
        Path png = documents.render(id, page, dpi);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .body(new FileSystemResource(png));
    }

    @GetMapping("/{id}/pages/{page}/text")
    public List<TextRun> pageText(@PathVariable String id, @PathVariable int page) {
        return documents.pageText(id, page);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> close(@PathVariable String id) {
        documents.close(id);
        return ResponseEntity.noContent().build();
    }
}

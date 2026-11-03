package com.adou.ofd.pages;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/page-tools")
public class PageToolController {

    private final PageToolService pageTools;

    public PageToolController(PageToolService pageTools) {
        this.pageTools = pageTools;
    }

    @PostMapping("/splits")
    public ResponseEntity<PageToolJob> split(@RequestBody(required = false) SplitRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(pageTools.submitSplit(request));
    }

    @PostMapping("/inserts")
    public ResponseEntity<PageToolJob> insert(@RequestBody(required = false) InsertRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(pageTools.submitInsert(request));
    }

    @GetMapping
    public List<PageToolJob> list(@RequestParam(defaultValue = "20") int limit) {
        return pageTools.list(limit);
    }

    @GetMapping("/{id}")
    public PageToolJob get(@PathVariable String id) {
        return pageTools.get(id);
    }

    @PostMapping("/{id}/cancel")
    public PageToolJob cancel(@PathVariable String id) {
        return pageTools.cancel(id);
    }
}

package com.adou.ofd.merge;

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
@RequestMapping("/api/merges")
public class MergeController {

    private final MergeService merges;

    public MergeController(MergeService merges) {
        this.merges = merges;
    }

    @PostMapping
    public ResponseEntity<MergeJob> create(@RequestBody(required = false) MergeRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(merges.submit(request));
    }

    @GetMapping
    public List<MergeJob> list(@RequestParam(defaultValue = "20") int limit) {
        return merges.list(limit);
    }

    @GetMapping("/{id}")
    public MergeJob get(@PathVariable String id) {
        return merges.get(id);
    }

    @PostMapping("/{id}/cancel")
    public MergeJob cancel(@PathVariable String id) {
        return merges.cancel(id);
    }
}

package com.adou.ofd.search;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/documents/{id}/searches")
public class SearchController {

    private final SearchService searches;

    public SearchController(SearchService searches) {
        this.searches = searches;
    }

    @PostMapping
    public ResponseEntity<SearchJob> start(
            @PathVariable String id,
            @RequestBody(required = false) SearchRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(searches.submit(id, request));
    }

    @GetMapping("/{searchId}")
    public SearchJob get(@PathVariable String id, @PathVariable String searchId) {
        return searches.get(id, searchId);
    }

    @PostMapping("/{searchId}/cancel")
    public SearchJob cancel(@PathVariable String id, @PathVariable String searchId) {
        return searches.cancel(id, searchId);
    }
}

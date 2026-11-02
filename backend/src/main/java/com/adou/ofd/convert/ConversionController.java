package com.adou.ofd.convert;

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
@RequestMapping("/api/conversions")
public class ConversionController {

    private final ConversionService conversions;

    public ConversionController(ConversionService conversions) {
        this.conversions = conversions;
    }

    @PostMapping
    public ResponseEntity<ConversionJob> create(@RequestBody(required = false) ConversionRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(conversions.submit(request));
    }

    @GetMapping
    public List<ConversionJob> list(@RequestParam(defaultValue = "20") int limit) {
        return conversions.list(limit);
    }

    /**
     * 批量添加文件：只读元数据，不建立阅读会话。
     */
    @PostMapping("/probe")
    public List<ProbeResult> probe(@RequestBody(required = false) ProbeRequest request) {
        return conversions.probe(request == null ? null : request.paths());
    }

    @GetMapping("/{id}")
    public ConversionJob get(@PathVariable String id) {
        return conversions.get(id);
    }

    @PostMapping("/{id}/cancel")
    public ConversionJob cancel(@PathVariable String id) {
        return conversions.cancel(id);
    }
}

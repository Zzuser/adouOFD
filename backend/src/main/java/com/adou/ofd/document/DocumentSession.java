package com.adou.ofd.document;

import java.nio.file.Path;
import java.util.List;

public record DocumentSession(
        String id,
        String name,
        Path path,
        long size,
        String kind,
        int pageCount,
        boolean signed,
        List<PageMeta> pages,
        Path workDir,
        boolean demo,
        DocumentHandle handle) {

    public DocumentSummary summary() {
        return new DocumentSummary(id, name, path.toString(), size, kind, pageCount, signed, demo, pages);
    }
}

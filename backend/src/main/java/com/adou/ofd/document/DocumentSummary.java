package com.adou.ofd.document;

import java.util.List;

public record DocumentSummary(
        String id,
        String name,
        String path,
        long size,
        String kind,
        int pageCount,
        boolean signed,
        boolean demo,
        List<PageMeta> pages) {
}

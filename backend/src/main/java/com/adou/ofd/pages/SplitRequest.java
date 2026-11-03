package com.adou.ofd.pages;

import java.util.List;

/**
 * 拆分请求：mode 为 PAGE（每页一份）、CHUNK（每 N 页一份）或 RANGES（按区间，每段一份）。
 */
public record SplitRequest(
        String sourcePath,
        String mode,
        Integer pagesPerFile,
        String ranges,
        String outputDir,
        String baseName) {
}

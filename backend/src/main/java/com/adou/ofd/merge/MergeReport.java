package com.adou.ofd.merge;

import java.util.List;

/**
 * 合并结果报告：输入文件数、页数、输出体积、耗时与可读告警。
 */
public record MergeReport(
        int sourceFiles,
        int sourcePages,
        int outputPages,
        long outputBytes,
        long durationMs,
        List<String> warnings) {
}

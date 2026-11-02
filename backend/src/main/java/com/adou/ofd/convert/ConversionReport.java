package com.adou.ofd.convert;

import java.util.List;

/**
 * 转换质量报告：页数校验、输出体积、耗时与可读的告警信息。
 */
public record ConversionReport(
        int sourcePages,
        int outputPages,
        long outputBytes,
        long durationMs,
        List<String> warnings) {
}

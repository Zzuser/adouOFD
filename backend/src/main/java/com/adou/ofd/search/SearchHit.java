package com.adou.ofd.search;

/**
 * 一处命中。start/end 是页面文本层拼接后的 UTF-16 下标，前端据此在文字层高亮；
 * x/y/height 为命中首字形在页面中的归一化坐标，用于精准滚动定位。
 */
public record SearchHit(
        int page,
        int start,
        int end,
        String before,
        String match,
        String after,
        boolean beforeTruncated,
        boolean afterTruncated,
        double x,
        double y,
        double height) {
}

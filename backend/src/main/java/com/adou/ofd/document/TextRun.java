package com.adou.ofd.document;

/**
 * 页面文本行。坐标与字号均归一化到页面宽/高（0-1），供前端文字层定位。
 */
public record TextRun(
        String text,
        double x,
        double y,
        double width,
        double height,
        double fontSize) {
}

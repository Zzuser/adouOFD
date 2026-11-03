package com.adou.ofd.pages;

/**
 * 插页请求：把 insertPath 的指定页插入 basePath 的第 position 页之前。
 *
 * <p>positionMode 为 START（开头）、BEFORE（指定页之前，需 position）或 END（末尾）。
 * insertRanges 留空表示插入全部页面。
 */
public record InsertRequest(
        String basePath,
        String insertPath,
        String insertRanges,
        String positionMode,
        Integer position,
        String outputPath,
        Boolean overwrite) {
}

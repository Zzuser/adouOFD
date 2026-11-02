package com.adou.ofd.convert;

/**
 * 批量添加文件时的轻量探测结果；单条失败只影响该项。
 */
public record ProbeResult(
        String path,
        String name,
        long size,
        String kind,
        int pages,
        String error) {
}

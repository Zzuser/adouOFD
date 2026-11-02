package com.adou.ofd.convert;

/**
 * 转换请求：documentId 与 sourcePath 二选一；target 为空时按源格式取反。
 */
public record ConversionRequest(
        String documentId,
        String sourcePath,
        String target,
        String outputPath,
        Boolean overwrite) {
}

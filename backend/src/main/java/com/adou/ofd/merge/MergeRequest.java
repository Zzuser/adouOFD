package com.adou.ofd.merge;

import java.util.List;

/**
 * 合并请求：files 的顺序就是最终页面顺序；target 仅支持 PDF 或 OFD。
 */
public record MergeRequest(
        List<String> files,
        String target,
        String outputPath,
        Boolean overwrite) {
}

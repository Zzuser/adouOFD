package com.adou.ofd.merge;

import java.util.List;

/**
 * 合并请求：files 的顺序就是最终页面顺序；target 仅支持 PDF 或 OFD。
 *
 * <p>pdfMode 仅在 target=PDF 时生效：AUTO（默认，超大时自动转图像）、
 * VECTOR（始终矢量，文字可选中）、IMAGE（始终图像，体积小）。
 */
public record MergeRequest(
        List<String> files,
        String target,
        String outputPath,
        Boolean overwrite,
        String pdfMode) {

    public MergeRequest(List<String> files, String target, String outputPath, Boolean overwrite) {
        this(files, target, outputPath, overwrite, null);
    }
}

package com.adou.ofd.document;

import java.util.List;
import java.util.Map;

/**
 * 文档元数据与签名条目。签名仅用于展示，不包含密码学验签结果。
 */
public record DocumentMetadata(
        Map<String, String> metadata,
        List<SignatureInfo> signatures,
        String warning) {
}

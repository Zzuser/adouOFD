package com.adou.ofd.document;

import java.util.List;
import java.util.Map;

public record DocumentProperties(
        DocumentSummary summary,
        Map<String, String> metadata,
        List<SignatureInfo> signatures,
        String warning) {
}

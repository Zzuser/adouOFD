package com.adou.ofd.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** 本地引擎访问令牌校验；空令牌表示不启用保护（开发模式）。 */
public final class ApiToken {

    private ApiToken() {
    }

    public static boolean matches(String expected, String provided) {
        if (expected == null || expected.isEmpty()) {
            return true;
        }
        if (provided == null) {
            return false;
        }
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }
}

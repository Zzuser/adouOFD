package com.adou.ofd.document;

public record SignatureInfo(
        String name,
        String reason,
        String location,
        String signTime) {
}

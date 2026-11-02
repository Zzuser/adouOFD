package com.adou.ofd.convert;

/**
 * 转换任务状态。
 */
public enum ConversionStatus {
    QUEUED,
    RUNNING,
    SUCCEEDED,
    FAILED,
    CANCELED;

    public boolean terminal() {
        return this == SUCCEEDED || this == FAILED || this == CANCELED;
    }
}

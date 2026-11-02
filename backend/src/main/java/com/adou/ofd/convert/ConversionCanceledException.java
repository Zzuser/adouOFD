package com.adou.ofd.convert;

/**
 * 转换被用户取消，用于在转换引擎内部中断当前页/批次。
 */
public class ConversionCanceledException extends RuntimeException {

    public ConversionCanceledException() {
        super("转换已取消");
    }
}

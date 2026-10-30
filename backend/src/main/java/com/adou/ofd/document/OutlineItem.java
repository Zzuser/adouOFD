package com.adou.ofd.document;

/**
 * 目录项（扁平化表示）。page 为 1-based 页码；无法解析目标页时为 null，仅展示标题。
 */
public record OutlineItem(String title, Integer page, int level) {
}

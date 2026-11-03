package com.adou.ofd.pages;

import java.nio.file.Path;
import java.util.List;

/**
 * 拆分计划：一组页码对应一个最终输出文件。
 */
record SplitPlan(List<Integer> pages, Path target) {
}

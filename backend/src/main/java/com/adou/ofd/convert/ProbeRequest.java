package com.adou.ofd.convert;

import java.util.List;

/**
 * 批量探测请求：一次最多 200 个路径，避免误传超大列表。
 */
public record ProbeRequest(List<String> paths) {
}

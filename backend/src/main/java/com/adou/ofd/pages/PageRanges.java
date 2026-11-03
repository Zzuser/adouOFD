package com.adou.ofd.pages;

import com.adou.ofd.web.ApiException;
import com.adou.ofd.web.Http;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 页码范围解析：支持 {@code 1-3,5,7-9} 这类写法。
 *
 * <p>拆分时逗号分隔的每一组输出一个文件；组内可用空格追加离散页码，
 * 例如 {@code 1-3 5} 表示一个包含第 1、2、3、5 页的文件。
 */
final class PageRanges {

    private static final Pattern TOKEN = Pattern.compile("^(\\d+)(?:-(\\d+))?$");
    private static final int MAX_LABEL_LENGTH = 60;

    private PageRanges() {
    }

    static List<List<Integer>> groups(String raw, int pageCount) {
        String value = normalize(raw);
        if (value.isEmpty()) {
            return List.of();
        }
        List<List<Integer>> groups = new ArrayList<>();
        for (String groupText : value.split(",")) {
            String group = groupText.trim();
            if (group.isEmpty()) {
                continue;
            }
            List<Integer> pages = new ArrayList<>();
            for (String token : group.split("[\\s、]+")) {
                if (token.isEmpty()) {
                    continue;
                }
                addToken(pages, token, pageCount);
            }
            if (pages.isEmpty()) {
                throw invalid(groupText);
            }
            groups.add(List.copyOf(pages));
        }
        if (groups.isEmpty()) {
            throw invalid(raw);
        }
        return List.copyOf(groups);
    }

    static List<Integer> pages(String raw, int pageCount) {
        List<Integer> pages = new ArrayList<>();
        for (List<Integer> group : groups(raw, pageCount)) {
            pages.addAll(group);
        }
        return List.copyOf(pages);
    }

    /**
     * 生成文件名片段：连续页码压缩成 {@code 01-03}，离散页码用下划线连接。
     */
    static String label(List<Integer> pages, int width) {
        if (pages == null || pages.isEmpty()) {
            return "pages";
        }
        int safeWidth = Math.max(2, width);
        StringBuilder label = new StringBuilder();
        int index = 0;
        while (index < pages.size()) {
            int start = pages.get(index);
            int end = start;
            while (index + 1 < pages.size() && pages.get(index + 1) == end + 1) {
                end++;
                index++;
            }
            if (label.length() > 0) {
                label.append('_');
            }
            label.append(pad(start, safeWidth));
            if (end > start) {
                label.append('-').append(pad(end, safeWidth));
            }
            index++;
            if (label.length() > MAX_LABEL_LENGTH) {
                return pad(pages.get(0), safeWidth) + "-" + pad(pages.get(pages.size() - 1), safeWidth)
                        + "_共" + pages.size() + "页";
            }
        }
        return label.toString();
    }

    private static void addToken(List<Integer> pages, String token, int pageCount) {
        Matcher matcher = TOKEN.matcher(token);
        if (!matcher.matches()) {
            throw invalid(token);
        }
        int start;
        int end;
        try {
            start = Integer.parseInt(matcher.group(1));
            end = matcher.group(2) == null ? start : Integer.parseInt(matcher.group(2));
        } catch (NumberFormatException ex) {
            throw invalid(token);
        }
        if (start < 1 || end < 1) {
            throw outOfRange(token, pageCount);
        }
        if (start > end) {
            throw new ApiException(Http.BAD_REQUEST, "INVALID_RANGES",
                    "起始页不能大于结束页：" + token);
        }
        if (end > pageCount) {
            throw outOfRange(token, pageCount);
        }
        for (int page = start; page <= end; page++) {
            pages.add(page);
        }
    }

    private static ApiException invalid(String text) {
        return new ApiException(Http.BAD_REQUEST, "INVALID_RANGES",
                "页码范围格式不正确：" + text + "（示例：1-3,5,7-9）");
    }

    private static ApiException outOfRange(String text, int pageCount) {
        return new ApiException(Http.BAD_REQUEST, "PAGE_OUT_OF_RANGE",
                "页码超出范围（1-" + pageCount + "）：" + text);
    }

    private static String normalize(String raw) {
        if (raw == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder(raw.length());
        for (int index = 0; index < raw.length(); index++) {
            char ch = raw.charAt(index);
            if (ch >= '０' && ch <= '９') {
                builder.append((char) (ch - 0xFEE0));
            } else if ("，；;".indexOf(ch) >= 0) {
                builder.append(',');
            } else if ("－—–~～至到".indexOf(ch) >= 0) {
                builder.append('-');
            } else {
                builder.append(ch);
            }
        }
        return builder.toString().trim();
    }

    private static String pad(int page, int width) {
        String text = Integer.toString(page);
        if (text.length() >= width) {
            return text;
        }
        return "0".repeat(width - text.length()) + text;
    }
}

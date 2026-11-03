package com.adou.ofd.pages;

import com.adou.ofd.convert.ConversionCanceledException;
import com.adou.ofd.convert.ConversionEngine;
import com.adou.ofd.merge.OfdResourceRepair;
import com.adou.ofd.merge.OfdStyleRepair;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.ofdrw.tool.merge.OFDMerger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 拆分/插页引擎：拆分按页码范围逐组导出；插页把插入文档的指定页放到目标页之前。
 *
 * <p>OFD 输入会先复制到独立临时文件名再交给 OFDMerger。OFDMerger 按文件名缓存文档上下文，
 * 同名文件会互相覆盖；同时样式/资源修复只应作用于副本，不能改动用户原文件。
 */
public class PageToolEngine {

    private static final String STYLE_WARNING = "已展开 OFD 中的样式继承，避免拆分/插入后框线或颜色丢失";
    private static final String RESOURCE_WARNING_PREFIX = "源 OFD 资源不完整，已补充 ";
    private static final String BOOKMARK_WARNING = "拆分/插入结果可能不保留原文档的目录/书签";

    private final ConversionEngine conversions;
    private final OfdResourceRepair resourceRepair;
    private final OfdStyleRepair styleRepair;

    public PageToolEngine(ConversionEngine conversions, OfdResourceRepair resourceRepair,
                          OfdStyleRepair styleRepair) {
        this.conversions = conversions;
        this.resourceRepair = resourceRepair;
        this.styleRepair = styleRepair;
    }

    public record GeneratedOutput(Path temp, Path target, int pages) {
    }

    public record SplitResult(List<GeneratedOutput> outputs, List<String> warnings) {
    }

    public record InsertResult(List<String> warnings) {
    }

    public SplitResult split(Path source, String kind, List<SplitPlan> plans, Path workDir,
                             ConversionEngine.Progress progress) throws IOException {
        if (plans.isEmpty()) {
            throw new IOException("没有可拆分的内容");
        }
        List<String> warnings = new ArrayList<>();
        List<GeneratedOutput> outputs = new ArrayList<>(plans.size());
        Path workingSource = source;
        if ("OFD".equals(kind)) {
            workingSource = workDir.resolve("source-" + token() + ".ofd");
            copyAndRepairOfd(source, workingSource, warnings);
        }

        int total = plans.size();
        if ("PDF".equals(kind)) {
            try (PDDocument document = Loader.loadPDF(source.toFile())) {
                for (int index = 0; index < total; index++) {
                    checkCanceled(progress);
                    SplitPlan plan = plans.get(index);
                    Path temp = workDir.resolve(String.format("split-%04d.pdf", index));
                    writePdfPages(document, plan.pages(), temp);
                    outputs.add(new GeneratedOutput(temp, plan.target(), plan.pages().size()));
                    progress.update(5 + (int) Math.round((index + 1) * 82.0 / total),
                            "正在拆分第 " + (index + 1) + "/" + total + " 组");
                }
            }
        } else {
            for (int index = 0; index < total; index++) {
                checkCanceled(progress);
                SplitPlan plan = plans.get(index);
                Path temp = workDir.resolve(String.format("split-%04d.ofd", index));
                writeOfdPages(workingSource, plan.pages(), temp);
                outputs.add(new GeneratedOutput(temp, plan.target(), plan.pages().size()));
                progress.update(5 + (int) Math.round((index + 1) * 82.0 / total),
                        "正在拆分第 " + (index + 1) + "/" + total + " 组");
            }
        }
        warn(warnings, BOOKMARK_WARNING);
        return new SplitResult(List.copyOf(outputs), List.copyOf(warnings));
    }

    public InsertResult insert(Path base, String baseKind, int basePages,
                               Path insert, String insertKind, List<Integer> pages,
                               int position, Path output, Path workDir,
                               ConversionEngine.Progress progress) throws IOException {
        if (pages.isEmpty()) {
            throw new IOException("请选择要插入的页面");
        }
        if (position < 0 || position > basePages) {
            throw new IOException("插入位置超出范围");
        }
        List<String> warnings = new ArrayList<>();
        if ("PDF".equals(baseKind)) {
            insertIntoPdf(base, basePages, insert, insertKind, pages, position, output, workDir,
                    progress, warnings);
        } else {
            insertIntoOfd(base, basePages, insert, insertKind, pages, position, output, workDir,
                    progress, warnings);
        }
        warn(warnings, BOOKMARK_WARNING);
        return new InsertResult(List.copyOf(warnings));
    }

    private void insertIntoPdf(Path base, int basePages, Path insert, String insertKind,
                               List<Integer> pages, int position, Path output, Path workDir,
                               ConversionEngine.Progress progress, List<String> warnings)
            throws IOException {
        Path insertPdf = insert;
        if ("OFD".equals(insertKind)) {
            Path repaired = workDir.resolve("insert-" + token() + ".ofd");
            copyAndRepairOfd(insert, repaired, warnings);
            Path selected = workDir.resolve("insert-selected-" + token() + ".ofd");
            writeOfdPages(repaired, pages, selected);
            insertPdf = workDir.resolve("insert-selected-" + token() + ".pdf");
            ConversionEngine.ExportMode mode = conversions.ofdToPdf(
                    selected, insertPdf, mapProgress(progress, 40, 72));
            if (mode == ConversionEngine.ExportMode.IMAGE) {
                warn(warnings, "插入的 OFD 已按图像写入 PDF，相关页面文字不可选中");
            }
            warn(warnings, "插入的 OFD 已转换为 PDF 后插入");
        }

        checkCanceled(progress);
        progress.update(76, "正在写入插入结果");
        try (PDDocument baseDocument = Loader.loadPDF(base.toFile());
             PDDocument target = new PDDocument()) {
            for (int page = 1; page <= position; page++) {
                target.importPage(baseDocument.getPage(page - 1));
            }
            if ("PDF".equals(insertKind)) {
                try (PDDocument insertDocument = Loader.loadPDF(insert.toFile())) {
                    for (int page : pages) {
                        target.importPage(insertDocument.getPage(page - 1));
                    }
                }
            } else {
                try (PDDocument insertDocument = Loader.loadPDF(insertPdf.toFile())) {
                    for (PDPage page : insertDocument.getPages()) {
                        target.importPage(page);
                    }
                }
            }
            for (int page = position + 1; page <= basePages; page++) {
                target.importPage(baseDocument.getPage(page - 1));
            }
            target.save(output.toFile());
        }
        progress.update(92, "插入结果已写入");
    }

    private void insertIntoOfd(Path base, int basePages, Path insert, String insertKind,
                               List<Integer> pages, int position, Path output, Path workDir,
                               ConversionEngine.Progress progress, List<String> warnings)
            throws IOException {
        checkCanceled(progress);
        Path baseCopy = workDir.resolve("base-" + token() + ".ofd");
        copyAndRepairOfd(base, baseCopy, warnings);

        Path insertPart;
        int[] insertPageNumbers;
        if ("OFD".equals(insertKind)) {
            insertPart = workDir.resolve("insert-" + token() + ".ofd");
            copyAndRepairOfd(insert, insertPart, warnings);
            insertPageNumbers = intRange(pages);
        } else {
            progress.update(35, "正在准备插入页");
            Path selectedPdf = workDir.resolve("insert-selected-" + token() + ".pdf");
            writePdfPages(insert, pages, selectedPdf);
            insertPart = workDir.resolve("insert-" + token() + ".ofd");
            boolean sharded = conversions.pdfToOfd(selectedPdf, insertPart,
                    mapProgress(progress, 40, 72));
            repairOfd(insertPart, warnings);
            insertPageNumbers = intRange(1, pages.size());
            if (sharded) {
                warn(warnings, "插入的 PDF 分片转换后合并，书签可能未保留");
            }
            warn(warnings, "插入的 PDF 已转换为 OFD 后插入，文字是否可选中取决于源 PDF 字体");
        }

        checkCanceled(progress);
        progress.update(78, "正在写入插入结果");
        try (OFDMerger merger = new OFDMerger(output)) {
            if (position > 0) {
                merger.add(baseCopy, intRange(1, position));
            }
            merger.add(insertPart, insertPageNumbers);
            if (position < basePages) {
                merger.add(baseCopy, intRange(position + 1, basePages));
            }
        }
        progress.update(93, "插入结果已写入");
    }

    private void writePdfPages(Path source, List<Integer> pages, Path target) throws IOException {
        try (PDDocument document = Loader.loadPDF(source.toFile())) {
            writePdfPages(document, pages, target);
        }
    }

    private void writePdfPages(PDDocument source, List<Integer> pages, Path target) throws IOException {
        try (PDDocument output = new PDDocument()) {
            for (int page : pages) {
                output.importPage(source.getPage(page - 1));
            }
            output.save(target.toFile());
        }
    }

    private void writeOfdPages(Path source, List<Integer> pages, Path target) throws IOException {
        try (OFDMerger merger = new OFDMerger(target)) {
            merger.add(source, intRange(pages));
        }
    }

    private void copyAndRepairOfd(Path source, Path target, List<String> warnings) throws IOException {
        Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
        repairOfd(target, warnings);
    }

    private void repairOfd(Path ofd, List<String> warnings) throws IOException {
        OfdStyleRepair.StyleRepairResult style = styleRepair.repair(ofd);
        OfdResourceRepair.RepairResult resources = resourceRepair.repair(ofd);
        if (style.changes() > 0) {
            warn(warnings, STYLE_WARNING);
        }
        if (resources.count() > 0) {
            warn(warnings, RESOURCE_WARNING_PREFIX + resources.count()
                    + " 个占位文件；相关图片可能无法显示");
        }
    }

    private int[] intRange(List<Integer> pages) {
        int[] result = new int[pages.size()];
        for (int index = 0; index < pages.size(); index++) {
            result[index] = pages.get(index);
        }
        return result;
    }

    private int[] intRange(int start, int end) {
        if (start > end) {
            return new int[0];
        }
        int[] result = new int[end - start + 1];
        for (int page = start; page <= end; page++) {
            result[page - start] = page;
        }
        return result;
    }

    private ConversionEngine.Progress mapProgress(ConversionEngine.Progress parent, int start, int end) {
        return new ConversionEngine.Progress() {
            @Override
            public void update(int percent, String phase) {
                int clamped = Math.max(0, Math.min(100, percent));
                int mapped = start + (int) Math.round((end - start) * clamped / 100.0);
                parent.update(mapped, phase);
            }

            @Override
            public boolean canceled() {
                return parent.canceled();
            }
        };
    }

    private void checkCanceled(ConversionEngine.Progress progress) {
        if (progress.canceled()) {
            throw new ConversionCanceledException();
        }
    }

    private void warn(List<String> warnings, String warning) {
        if (!warnings.contains(warning)) {
            warnings.add(warning);
        }
    }

    private String token() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}

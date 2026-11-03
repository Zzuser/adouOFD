package com.adou.ofd.merge;

import com.adou.ofd.convert.ConversionCanceledException;
import com.adou.ofd.convert.ConversionEngine;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.ofdrw.tool.merge.OFDMerger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * 合并引擎：先把混合输入归一化到目标格式，再按传入顺序合并。
 *
 * <p>OFD 输入即使已经是目标格式也会复制成唯一临时文件名再交给 OFDMerger，
 * 因为 OFDMerger 内部按文件名缓存文档上下文，同名文件会互相覆盖。
 */
public class MergeEngine {

    private final ConversionEngine conversions;
    private final OfdResourceRepair resourceRepair;
    private final OfdStyleRepair styleRepair;

    public MergeEngine(ConversionEngine conversions, OfdResourceRepair resourceRepair,
                       OfdStyleRepair styleRepair) {
        this.conversions = conversions;
        this.resourceRepair = resourceRepair;
        this.styleRepair = styleRepair;
    }

    public record MergeResult(int sourcePages, ConversionEngine.ExportMode mode, List<String> warnings) {
    }

    public MergeResult merge(List<Path> sources, String target, Path output, Path workDir,
                             ConversionEngine.Progress progress) throws IOException {
        if (sources.size() < 2) {
            throw new IOException("至少需要 2 个文件才能合并");
        }
        boolean targetPdf = "PDF".equals(target);
        List<Path> parts = new ArrayList<>(sources.size());
        List<String> warnings = new ArrayList<>();
        int sourcePages = 0;
        int converted = 0;
        boolean imageMode = false;
        boolean sharded = false;
        boolean pdfToOfd = false;
        int count = sources.size();

        for (int index = 0; index < count; index++) {
            checkCanceled(progress);
            Path source = sources.get(index);
            ConversionEngine.SourceInfo info = conversions.probe(source);
            sourcePages += info.pages();

            int start = 1 + (int) Math.floor(index * 69.0 / count);
            int end = 1 + (int) Math.floor((index + 1) * 69.0 / count);
            progress.update(start, "正在处理第 " + (index + 1) + "/" + count + " 个文件");

            if (targetPdf) {
                if ("PDF".equals(info.kind())) {
                    parts.add(source);
                } else {
                    Path part = workDir.resolve(String.format("part-%04d.pdf", index + 1));
                    ConversionEngine.ExportMode mode = conversions.ofdToPdf(
                            source, part, mapProgress(progress, start, end));
                    if (mode == ConversionEngine.ExportMode.IMAGE) {
                        imageMode = true;
                    }
                    parts.add(part);
                    converted++;
                }
            } else {
                Path part = workDir.resolve(String.format("part-%04d.ofd", index + 1));
                if ("OFD".equals(info.kind())) {
                    Files.copy(source, part, StandardCopyOption.REPLACE_EXISTING);
                } else {
                    if (conversions.pdfToOfd(source, part, mapProgress(progress, start, end))) {
                        sharded = true;
                    }
                    pdfToOfd = true;
                    converted++;
                }
                parts.add(part);
            }
            progress.update(end, "已处理第 " + (index + 1) + "/" + count + " 个文件");
        }

        if (sourcePages <= 0) {
            throw new IOException("待合并文档不包含任何页面");
        }
        checkCanceled(progress);
        if (!targetPdf) {
            int repaired = 0;
            int styles = 0;
            for (Path part : parts) {
                styles += styleRepair.repair(part).changes();
                repaired += resourceRepair.repair(part).count();
            }
            if (styles > 0) {
                warnings.add("已展开 OFD 中的样式继承，避免合并后框线/颜色丢失");
            }
            if (repaired > 0) {
                warnings.add("源 OFD 资源不完整，已补充 " + repaired
                        + " 个占位文件；相关图片可能无法显示");
            }
        }
        progress.update(72, targetPdf ? "正在合并 PDF" : "正在合并 OFD");
        if (targetPdf) {
            mergePdf(parts, output);
        } else {
            mergeOfd(parts, output);
        }

        progress.update(92, "正在校验合并结果");
        checkCanceled(progress);
        int outputPages = conversions.probe(output).pages();
        if (outputPages != sourcePages) {
            throw new IOException("合并结果页数不一致：输入 " + sourcePages + " 页，输出 " + outputPages + " 页");
        }

        if (converted > 0) {
            warnings.add("其中 " + converted + " 个文件已转换为 " + target + " 后合并");
        }
        if (imageMode) {
            warnings.add("部分 OFD 已按图像写入 PDF，相关页面文字不可选中");
        }
        if (sharded) {
            warnings.add("大 PDF 分片转换后合并，书签可能未保留");
        }
        if (pdfToOfd) {
            warnings.add("PDF 转 OFD 是否保留文字取决于源 PDF 字体");
        }
        warnings.add("合并结果可能不保留各文件的目录/书签");
        return new MergeResult(sourcePages, imageMode ? ConversionEngine.ExportMode.IMAGE
                : ConversionEngine.ExportMode.VECTOR, List.copyOf(warnings));
    }

    private void mergeOfd(List<Path> parts, Path output) throws IOException {
        try (OFDMerger merger = new OFDMerger(output)) {
            for (Path part : parts) {
                merger.add(part);
            }
        }
    }

    private void mergePdf(List<Path> parts, Path output) throws IOException {
        PDFMergerUtility merger = new PDFMergerUtility();
        merger.setDestinationFileName(output.toString());
        for (Path part : parts) {
            merger.addSource(part.toFile());
        }
        merger.mergeDocuments(IOUtils.createTempFileOnlyStreamCache());
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
}

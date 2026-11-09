package com.adou.ofd.render;

import org.ofdrw.core.basicStructure.pageObj.layer.CT_Layer;
import org.ofdrw.core.basicStructure.pageObj.layer.PageBlockType;
import org.ofdrw.core.basicStructure.pageObj.layer.block.CT_PageBlock;
import org.ofdrw.core.basicStructure.pageObj.layer.block.CompositeObject;
import org.ofdrw.core.basicType.ST_Array;
import org.ofdrw.core.basicType.ST_Box;
import org.ofdrw.core.compositeObj.CT_VectorG;
import org.ofdrw.core.graph.pathObj.CT_Path;
import org.ofdrw.core.pageDescription.CT_GraphicUnit;
import org.ofdrw.core.pageDescription.clips.Area;
import org.ofdrw.core.pageDescription.clips.CT_Clip;
import org.ofdrw.core.pageDescription.clips.Clips;
import org.ofdrw.reader.OFDReader;
import org.ofdrw.reader.PageInfo;
import org.ofdrw.reader.ResourceManage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashSet;
import java.util.Set;

/**
 * 修正裁剪区坐标未按 Boundary 平移导致的渲染缺失。
 *
 * <p>GB/T 33190-2016 8.1.4 规定图元内部数据（含路径数据和裁剪区数据）以外接矩形左上角为坐标原点。
 * PDF→OFD 转换产生的裁剪区普遍是“路径数据从 0 开始、Boundary 指向页面位置”，WPS 等阅读器按
 * Boundary 平移后裁剪正确；ofdrw 2.5.1 渲染裁剪区时只按<em>图元自身</em>的 Boundary 平移、
 * 忽略了裁剪区自己的 Boundary，裁剪区被画到页面左上角，把该图元的内容整块裁掉（表现为缺字）。
 * 这里给这类裁剪区补一个平移 CTM，只改内存模型，不修改源文件。
 */
final class OfdClipPlacement {

    private static final Logger log = LoggerFactory.getLogger(OfdClipPlacement.class);
    private static final double ORIGIN_EPSILON = 0.01;

    private OfdClipPlacement() {
    }

    static void normalize(OFDReader reader) {
        try {
            ResourceManage resources = reader.getResMgt();
            int fixed = 0;
            for (PageInfo page : reader.getPageList()) {
                try {
                    for (CT_Layer layer : page.getAllLayer()) {
                        fixed += normalizeBlock(layer, resources, new HashSet<>());
                    }
                } catch (RuntimeException ex) {
                    log.debug("裁剪区定位修正失败: page={}", page.getPageN(), ex);
                }
            }
            if (fixed > 0) {
                log.info("已按 Boundary 修正 {} 个裁剪区的位置", fixed);
            }
        } catch (RuntimeException ex) {
            log.warn("裁剪区定位修正中断，按原始坐标渲染", ex);
        }
    }

    private static int normalizeBlock(CT_PageBlock block, ResourceManage resources, Set<String> visitedVectors) {
        int fixed = 0;
        for (PageBlockType child : block.getPageBlocks()) {
            if (child instanceof CT_PageBlock nested) {
                fixed += normalizeBlock(nested, resources, visitedVectors);
            }
            if (child instanceof CompositeObject composite) {
                CT_VectorG vector = resolveVector(composite, resources, visitedVectors);
                if (vector != null && vector.getContent() != null) {
                    fixed += normalizeBlock(vector.getContent(), resources, visitedVectors);
                }
            }
            if (child instanceof CT_GraphicUnit<?> unit) {
                fixed += normalizeClips(unit);
            }
        }
        return fixed;
    }

    private static CT_VectorG resolveVector(CompositeObject composite, ResourceManage resources,
                                            Set<String> visitedVectors) {
        var reference = composite.getResourceID();
        if (reference == null || reference.getRefId() == null || reference.getRefId().getId() == null) {
            return null;
        }
        String id = reference.getRefId().getId().toString();
        if (!visitedVectors.add(id)) {
            return null;
        }
        return resources.getCompositeGraphicUnit(id);
    }

    private static int normalizeClips(CT_GraphicUnit<?> unit) {
        Clips clips = unit.getClips();
        if (clips == null) {
            return 0;
        }
        int fixed = 0;
        for (CT_Clip clip : clips.getClips()) {
            if (clip == null || clip.getAreas() == null) {
                continue;
            }
            for (Area area : clip.getAreas()) {
                if (placeClip(area)) {
                    fixed++;
                }
            }
        }
        return fixed;
    }

    /**
     * 裁剪区数据以 (0,0) 起始、Boundary 却在别处时，补上 Boundary 位移。
     *
     * @return 是否补上了 CTM
     */
    static boolean placeClip(Area area) {
        if (area == null || area.getCTM() != null) {
            return false;
        }
        if (!(area.getClipObj() instanceof CT_Path path) || path.getCTM() != null) {
            return false;
        }
        ST_Box boundary = path.getBoundary();
        if (boundary == null
                || boundary.getTopLeftX() == null
                || boundary.getTopLeftY() == null) {
            return false;
        }
        double x = boundary.getTopLeftX();
        double y = boundary.getTopLeftY();
        if (Math.abs(x) < ORIGIN_EPSILON && Math.abs(y) < ORIGIN_EPSILON) {
            return false;
        }
        if (!startsAtOrigin(path.getAbbreviatedData())) {
            return false;
        }
        area.setCTM(new ST_Array(1, 0, 0, 1, x, y));
        return true;
    }

    private static boolean startsAtOrigin(String data) {
        if (data == null) {
            return false;
        }
        String[] tokens = data.trim().split("\\s+");
        for (int index = 0; index + 1 < tokens.length; index++) {
            Double x = number(tokens[index]);
            Double y = number(tokens[index + 1]);
            if (x != null && y != null) {
                return Math.abs(x) < ORIGIN_EPSILON && Math.abs(y) < ORIGIN_EPSILON;
            }
        }
        return false;
    }

    private static Double number(String token) {
        if (token.isEmpty() || Character.isLetter(token.charAt(0))) {
            return null;
        }
        try {
            return Double.parseDouble(token);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}

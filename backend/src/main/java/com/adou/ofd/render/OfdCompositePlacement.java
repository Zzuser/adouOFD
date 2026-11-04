package com.adou.ofd.render;

import org.ofdrw.core.basicStructure.pageObj.layer.CT_Layer;
import org.ofdrw.core.basicStructure.pageObj.layer.PageBlockType;
import org.ofdrw.core.basicStructure.pageObj.layer.block.CT_PageBlock;
import org.ofdrw.core.basicStructure.pageObj.layer.block.CompositeObject;
import org.ofdrw.core.basicType.ST_Array;
import org.ofdrw.core.basicType.ST_Box;
import org.ofdrw.core.compositeObj.CT_VectorG;
import org.ofdrw.core.pageDescription.CT_GraphicUnit;
import org.ofdrw.reader.OFDReader;
import org.ofdrw.reader.PageInfo;
import org.ofdrw.reader.ResourceManage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 修正未声明 CTM 的组合对象位置。
 *
 * <p>部分 OFD 生产工具（如铁路电子客票）把组合对象内容画在局部坐标原点，
 * 再用 Boundary 指定它在页面上的位置。ofdrw 2.5.1 的 ImageMaker 与
 * PdfboxMaker 只应用 CTM、忽略 Boundary 平移，签章会被画到页面左上角。
 * 这里在打开文档后为这类组合对象补上 Boundary 位移，只改内存模型，不修改源文件。
 */
public final class OfdCompositePlacement {

    private static final Logger log = LoggerFactory.getLogger(OfdCompositePlacement.class);
    private static final double EPSILON = 0.01;
    private static final double PLACED_OVERLAP_RATIO = 0.5;

    private OfdCompositePlacement() {
    }

    public static void normalize(OFDReader reader) {
        try {
            ResourceManage resources = reader.getResMgt();
            int fixed = 0;
            for (PageInfo page : reader.getPageList()) {
                try {
                    for (CT_Layer layer : page.getAllLayer()) {
                        fixed += normalizeBlock(layer, resources);
                    }
                } catch (RuntimeException ex) {
                    log.debug("组合对象定位修正失败: page={}", page.getPageN(), ex);
                }
            }
            if (fixed > 0) {
                log.info("已修正 {} 个组合对象的位置", fixed);
            }
        } catch (RuntimeException ex) {
            log.warn("组合对象定位修正中断，按原始坐标渲染", ex);
        }
    }

    private static int normalizeBlock(CT_PageBlock block, ResourceManage resources) {
        int fixed = 0;
        for (PageBlockType child : block.getPageBlocks()) {
            if (child instanceof CompositeObject composite) {
                if (placeAtBoundary(composite, resolveVector(composite, resources))) {
                    fixed++;
                }
            } else if (child instanceof CT_PageBlock nested) {
                fixed += normalizeBlock(nested, resources);
            }
        }
        return fixed;
    }

    private static CT_VectorG resolveVector(CompositeObject composite, ResourceManage resources) {
        var reference = composite.getResourceID();
        if (reference == null || reference.getRefId() == null || reference.getRefId().getId() == null) {
            return null;
        }
        return resources.getCompositeGraphicUnit(reference.getRefId().getId().toString());
    }

    /**
     * 内容已在页面坐标中（与 Boundary 重叠）时保持原样，否则按 Boundary 原点平移。
     *
     * @return 是否补上了 CTM
     */
    static boolean placeAtBoundary(CompositeObject composite, CT_VectorG vector) {
        if (composite.getCTM() != null) {
            return false;
        }
        ST_Box boundary = composite.getBoundary();
        if (!isValid(boundary)) {
            return false;
        }
        double x = boundary.getTopLeftX();
        double y = boundary.getTopLeftY();
        if (Math.abs(x) < EPSILON && Math.abs(y) < EPSILON) {
            return false;
        }
        Bounds content = vector == null ? null : boundsOf(vector.getContent());
        if (content == null || content.overlapRatio(boundary) >= PLACED_OVERLAP_RATIO) {
            return false;
        }
        composite.setCTM(new ST_Array(1, 0, 0, 1, x, y));
        return true;
    }

    private static Bounds boundsOf(CT_PageBlock block) {
        if (block == null) {
            return null;
        }
        Bounds bounds = null;
        for (PageBlockType child : block.getPageBlocks()) {
            if (child instanceof CT_PageBlock nested) {
                bounds = Bounds.union(bounds, boundsOf(nested));
            } else if (child instanceof CT_GraphicUnit<?> unit && isValid(unit.getBoundary())) {
                bounds = Bounds.union(bounds, Bounds.of(unit.getBoundary()));
            }
        }
        return bounds;
    }

    private static boolean isValid(ST_Box box) {
        return box != null
                && box.getTopLeftX() != null
                && box.getTopLeftY() != null
                && box.getWidth() != null
                && box.getHeight() != null
                && box.getWidth() > 0
                && box.getHeight() > 0;
    }

    private record Bounds(double left, double top, double right, double bottom) {

        static Bounds of(ST_Box box) {
            double left = box.getTopLeftX();
            double top = box.getTopLeftY();
            return new Bounds(left, top, left + box.getWidth(), top + box.getHeight());
        }

        static Bounds union(Bounds first, Bounds second) {
            if (first == null) {
                return second;
            }
            if (second == null) {
                return first;
            }
            return new Bounds(
                    Math.min(first.left, second.left),
                    Math.min(first.top, second.top),
                    Math.max(first.right, second.right),
                    Math.max(first.bottom, second.bottom));
        }

        double overlapRatio(ST_Box boundary) {
            double width = Math.min(right, boundary.getTopLeftX() + boundary.getWidth())
                    - Math.max(left, boundary.getTopLeftX());
            double height = Math.min(bottom, boundary.getTopLeftY() + boundary.getHeight())
                    - Math.max(top, boundary.getTopLeftY());
            if (width <= 0 || height <= 0) {
                return 0;
            }
            return (width * height) / (boundary.getWidth() * boundary.getHeight());
        }
    }
}

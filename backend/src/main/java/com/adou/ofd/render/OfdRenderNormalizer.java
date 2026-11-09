package com.adou.ofd.render;

import org.ofdrw.reader.OFDReader;

/**
 * 渲染前对 OFD 内存模型做 Boundary 归一化。
 *
 * <p>GB/T 33190-2016 8.1.4 要求图元内部数据（路径、文字、裁剪区）以图元外接矩形左上角为原点。
 * ofdrw 2.5.1 的两个渲染后端对这条规则的实现不一致，同一份模型需要补丁的地方也不同：
 *
 * <table>
 *   <tr><th>图元</th><th>{@link Backend#IMAGE}（ImageMaker / AWT）</th>
 *       <th>{@link Backend#PDF}（PdfboxMaker / PageRendererImpl）</th></tr>
 *   <tr><td>PathObject</td><td>按 Boundary 平移</td><td>按 Boundary 平移</td></tr>
 *   <tr><td>TextObject</td><td>按 Boundary 平移</td><td>文字布局引擎处理</td></tr>
 *   <tr><td>ImageObject</td><td>按 Boundary 平移</td><td>按 Boundary 平移</td></tr>
 *   <tr><td>CompositeObject</td><td><b>不平移</b>（需补 CTM）</td><td><b>不平移</b>（需补 CTM）</td></tr>
 *   <tr><td>Clips 裁剪区</td><td><b>不平移</b>（需补 CTM）</td><td>按 Boundary 平移</td></tr>
 * </table>
 *
 * <p>因此所有渲染入口都应调用本类而不是单个补丁类：补多了会在已经正确的后端上造成二次偏移，
 * 补少了则会裁掉内容。新增渲染路径时只需声明目标后端。
 */
public final class OfdRenderNormalizer {

    /** 渲染后端，决定需要哪些补偿。 */
    public enum Backend {
        /** 位图渲染：预览、按图像导出 PDF。 */
        IMAGE,
        /** 矢量 PDF 渲染：OFD→PDF、打印。 */
        PDF
    }

    private OfdRenderNormalizer() {
    }

    public static void normalize(OFDReader reader, Backend backend) {
        // 两个后端都忽略组合对象自身的 Boundary，必须补 CTM。
        OfdCompositePlacement.normalize(reader);
        if (backend == Backend.IMAGE) {
            // PDF 后端（ClipApplier.areaToPage）已按裁剪区 Boundary 平移，不能再补，否则二次偏移。
            OfdClipPlacement.normalize(reader);
        }
    }
}

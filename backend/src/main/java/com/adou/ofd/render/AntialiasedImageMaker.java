package com.adou.ofd.render;

import org.ofdrw.converter.ImageMaker;
import org.ofdrw.reader.OFDReader;
import org.ofdrw.reader.PageInfo;
import org.ujmp.core.Matrix;

import java.awt.Graphics2D;
import java.awt.RenderingHints;

/**
 * 开启抗锯齿的 ImageMaker。
 *
 * <p>ofdrw 2.5.1 的 ImageMaker 主渲染路径拿到 Graphics2D 后直接绘制，没有调用
 * Graphics2DRenderer.beginPage，因此渲染器在 beginPage 里设置的抗锯齿和 STROKE_PURE
 * 不会生效，输出只有纯黑/纯白。发票小字号宋体的横画只有约 0.05mm，144 DPI 下不足
 * 一个像素，会被整条丢弃，表现为笔画断裂、文字发虚。
 *
 * <p>这里在页面绘制前补上渲染提示，让细笔画以灰度覆盖的形式保留，渲染结果与 PDF
 * 阅读器一致。
 */
public final class AntialiasedImageMaker extends ImageMaker {

    public AntialiasedImageMaker(OFDReader reader, double ppm) {
        super(reader, ppm);
    }

    @Override
    protected void writePage(Graphics2D graphics, PageInfo page, Matrix matrix) {
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        super.writePage(graphics, page, matrix);
    }
}

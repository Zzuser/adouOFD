package com.adou.ofd.document;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;

/**
 * 将已渲染页面旋转 90 的整数倍。图像由引擎按原方向渲染，旋转只影响显示与打印。
 */
public final class ImageRotation {

    private ImageRotation() {
    }

    public static BufferedImage rotate(BufferedImage source, int degrees) {
        int rotation = ((degrees % 360) + 360) % 360;
        if (rotation == 0) {
            return source;
        }
        if (rotation % 90 != 0) {
            throw new IllegalArgumentException("旋转角度必须是 90 的倍数");
        }
        int width = source.getWidth();
        int height = source.getHeight();
        boolean quarter = rotation == 90 || rotation == 270;
        int targetWidth = quarter ? height : width;
        int targetHeight = quarter ? width : height;
        int type = source.getType() == BufferedImage.TYPE_CUSTOM
                ? BufferedImage.TYPE_INT_ARGB
                : source.getType();
        BufferedImage target = new BufferedImage(targetWidth, targetHeight, type);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setRenderingHint(
                    RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
            AffineTransform transform = new AffineTransform();
            switch (rotation) {
                case 90 -> {
                    transform.translate(height, 0);
                    transform.rotate(Math.PI / 2);
                }
                case 180 -> {
                    transform.translate(width, height);
                    transform.rotate(Math.PI);
                }
                case 270 -> {
                    transform.translate(0, width);
                    transform.rotate(-Math.PI / 2);
                }
                default -> {
                }
            }
            graphics.drawImage(source, transform, null);
        } finally {
            graphics.dispose();
        }
        return target;
    }
}

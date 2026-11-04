package com.adou.ofd.merge;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * 工作副本的可写性处理。
 *
 * <p>Windows 下 {@link Files#copy} 会把源文件的只读属性带到目标副本。
 * 微信等客户端缓存中的 OFD 常为只读，合并/拆分的临时副本如果保持只读，
 * 样式或资源修复用临时文件原子替换时会抛 {@code AccessDeniedException}。
 */
public final class OfdFileAccess {

    private OfdFileAccess() {
    }

    /**
     * 清除文件的只读属性，确保后续可以原子替换。
     *
     * @param path 工作副本路径；不存在时直接返回
     * @throws IOException 文件仍不可写
     */
    public static void makeWritable(Path path) throws IOException {
        if (path == null || !Files.exists(path)) {
            return;
        }
        if (path.toFile().setWritable(true)) {
            return;
        }
        if (!Files.isWritable(path)) {
            throw new IOException("无法清除文件只读属性：" + path);
        }
    }

    /**
     * 用临时文件原子替换目标文件；只读/占用导致的失败转换为可读错误。
     *
     * @param temp   已写完的临时文件
     * @param target 目标工作副本
     * @throws IOException 替换失败
     */
    public static void replace(Path temp, Path target) throws IOException {
        try {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            moveReplacing(temp, target);
        } catch (AccessDeniedException ex) {
            throw denied(target, ex);
        }
    }

    private static void moveReplacing(Path temp, Path target) throws IOException {
        try {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (AccessDeniedException ex) {
            throw denied(target, ex);
        }
    }

    private static IOException denied(Path target, AccessDeniedException cause) {
        return new IOException("无法写入 OFD 临时副本（文件可能为只读或被占用）：" + target, cause);
    }
}

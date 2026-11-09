package com.adou.ofd.render;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** 合成最小 OFD，供渲染回归测试使用。 */
final class OfdFixtures {

    private OfdFixtures() {
    }

    /**
     * 50×50mm 页面，一个 20×20mm 黑块，外加强制裁剪区：
     * 裁剪区 Boundary 在 (30,50)，路径数据却从 (0,0) 开始，未按 Boundary 平移时整块不可见。
     */
    static Path clipBoundary(Path dir) throws IOException {
        return write(dir, "clip-boundary.ofd", 100, """
                <ofd:PathObject ID="4" Boundary="0 0 100 100" Fill="true" Stroke="false" DrawParam="10">
                  <ofd:AbbreviatedData>M 35 55 L 55 55 L 55 75 L 35 75 L 35 55 C</ofd:AbbreviatedData>
                  <ofd:Clips><ofd:Clip><ofd:Area>
                    <ofd:Path Boundary="30 50 40 40">
                      <ofd:AbbreviatedData>M 0 0 L 0 40 L 40 40 L 40 0 C</ofd:AbbreviatedData>
                    </ofd:Path>
                  </ofd:Area></ofd:Clip></ofd:Clips>
                </ofd:PathObject>
                """);
    }

    /** 三条 0.05 / 0.10 / 0.15mm 高的细横线，用于检查亚像素笔画的栅格化。 */
    static Path thinStrokes(Path dir) throws IOException {
        return write(dir, "thin-strokes.ofd", 50, """
                <ofd:PathObject ID="4" Boundary="0 0 50 50" Fill="true" Stroke="false" DrawParam="10">
                  <ofd:AbbreviatedData>M 10 10 L 40 10 L 40 10.05 L 10 10.05 L 10 10 C</ofd:AbbreviatedData>
                </ofd:PathObject>
                <ofd:PathObject ID="5" Boundary="0 0 50 50" Fill="true" Stroke="false" DrawParam="10">
                  <ofd:AbbreviatedData>M 10 20 L 40 20 L 40 20.1 L 10 20.1 L 10 20 C</ofd:AbbreviatedData>
                </ofd:PathObject>
                <ofd:PathObject ID="6" Boundary="0 0 50 50" Fill="true" Stroke="false" DrawParam="10">
                  <ofd:AbbreviatedData>M 10 30 L 40 30 L 40 30.15 L 10 30.15 L 10 30 C</ofd:AbbreviatedData>
                </ofd:PathObject>
                """);
    }

    private static Path write(Path dir, String name, double pageSize, String pathObjects) throws IOException {
        Path ofd = dir.resolve(name);
        try (OutputStream stream = Files.newOutputStream(ofd);
             ZipOutputStream zip = new ZipOutputStream(stream)) {
            put(zip, "OFD.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" Version="1.2" DocType="OFD">
                      <ofd:DocBody>
                        <ofd:DocInfo><ofd:DocID>adou-test</ofd:DocID>
                          <ofd:Creator>adou-test</ofd:Creator><ofd:CreatorVersion>1.0</ofd:CreatorVersion>
                        </ofd:DocInfo>
                        <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
                      </ofd:DocBody>
                    </ofd:OFD>
                    """);
            put(zip, "Doc_0/Document.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
                      <ofd:CommonData>
                        <ofd:PageArea><ofd:PhysicalBox>0 0 %1$s %1$s</ofd:PhysicalBox>
                          <ofd:ApplicationBox>0 0 %1$s %1$s</ofd:ApplicationBox></ofd:PageArea>
                        <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
                        <ofd:MaxUnitID>10</ofd:MaxUnitID>
                      </ofd:CommonData>
                      <ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages>
                    </ofd:Document>
                    """.formatted(number(pageSize)));
            put(zip, "Doc_0/DocumentRes.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
                      <ofd:DrawParams>
                        <ofd:DrawParam ID="10" Join="Miter" LineWidth="0.1" Cap="Butt" MiterLimit="10">
                          <ofd:FillColor Value="0 0 0"/><ofd:StrokeColor Value="0 0 0"/>
                        </ofd:DrawParam>
                      </ofd:DrawParams>
                    </ofd:Res>
                    """);
            put(zip, "Doc_0/Pages/Page_0/Content.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
                      <ofd:Area><ofd:PhysicalBox>0 0 %1$s %1$s</ofd:PhysicalBox>
                        <ofd:ApplicationBox>0 0 %1$s %1$s</ofd:ApplicationBox></ofd:Area>
                      <ofd:Content>
                        <ofd:Layer Type="Body" ID="2"><ofd:PageBlock ID="3">
                    %2$s
                        </ofd:PageBlock></ofd:Layer>
                      </ofd:Content>
                    </ofd:Page>
                    """.formatted(number(pageSize), pathObjects));
        }
        return ofd;
    }

    private static String number(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}

package com.adou.ofd.render;

import org.dom4j.DocumentHelper;
import org.junit.jupiter.api.Test;
import org.ofdrw.core.pageDescription.clips.Area;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfdClipPlacementTest {

    @Test
    void translatesRelativeClipToBoundaryOrigin() throws Exception {
        Area area = area("<ofd:Path Boundary='125 34.5 83 8'>"
                + "<ofd:AbbreviatedData>M 0 0 L 0 8 L 83 8 L 83 0 C</ofd:AbbreviatedData></ofd:Path>");

        assertTrue(OfdClipPlacement.placeClip(area));

        Double[] ctm = area.getCTM().toDouble();
        assertNotNull(ctm);
        assertTrue(Math.abs(ctm[4] - 125) < 0.001, "水平位移应为裁剪区 Boundary 的 x");
        assertTrue(Math.abs(ctm[5] - 34.5) < 0.001, "垂直位移应为裁剪区 Boundary 的 y");
    }

    @Test
    void keepsClipThatAlreadyDeclaresCtm() throws Exception {
        Area area = area("<ofd:Path Boundary='125 34.5 83 8'>"
                + "<ofd:AbbreviatedData>M 0 0 L 0 8 L 83 8 L 83 0 C</ofd:AbbreviatedData></ofd:Path>");
        area.setCTM(new org.ofdrw.core.basicType.ST_Array(1, 0, 0, 1, 5, 6));

        assertFalse(OfdClipPlacement.placeClip(area));

        Double[] ctm = area.getCTM().toDouble();
        assertTrue(Math.abs(ctm[4] - 5) < 0.001);
        assertTrue(Math.abs(ctm[5] - 6) < 0.001);
    }

    @Test
    void keepsClipWithAbsoluteData() throws Exception {
        Area area = area("<ofd:Path Boundary='125 34.5 83 8'>"
                + "<ofd:AbbreviatedData>M 125 34.5 L 125 42.5 L 208 42.5 L 208 34.5 C</ofd:AbbreviatedData>"
                + "</ofd:Path>");

        assertFalse(OfdClipPlacement.placeClip(area));
        assertNull(area.getCTM());
    }

    @Test
    void ignoresBoundaryAtOrigin() throws Exception {
        Area area = area("<ofd:Path Boundary='0 0 83 8'>"
                + "<ofd:AbbreviatedData>M 0 0 L 0 8 L 83 8 L 83 0 C</ofd:AbbreviatedData></ofd:Path>");

        assertFalse(OfdClipPlacement.placeClip(area));
        assertNull(area.getCTM());
    }

    @Test
    void ignoresTextClipObject() throws Exception {
        Area area = area("<ofd:Text Boundary='125 34.5 83 8'/>");

        assertFalse(OfdClipPlacement.placeClip(area));
        assertNull(area.getCTM());
    }

    private Area area(String child) throws Exception {
        String xml = "<ofd:Area xmlns:ofd='http://www.ofdspec.org/2016'>"
                + child
                + "</ofd:Area>";
        return new Area(DocumentHelper.parseText(xml).getRootElement());
    }
}

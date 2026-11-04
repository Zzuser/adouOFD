package com.adou.ofd.render;

import org.dom4j.DocumentHelper;
import org.junit.jupiter.api.Test;
import org.ofdrw.core.basicStructure.pageObj.layer.block.CompositeObject;
import org.ofdrw.core.compositeObj.CT_VectorG;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfdCompositePlacementTest {

    @Test
    void translatesLocalContentToBoundaryOrigin() throws Exception {
        CompositeObject composite = composite("Boundary='90 4 30 20'");
        CT_VectorG vector = vector("<ofd:PathObject ID='3' Boundary='-0.5 -0.5 31 21'/>");

        assertTrue(OfdCompositePlacement.placeAtBoundary(composite, vector));

        Double[] ctm = composite.getCTM().toDouble();
        assertNotNull(ctm);
        assertTrue(Math.abs(ctm[4] - 90) < 0.001, "水平位移应为 Boundary 的 x");
        assertTrue(Math.abs(ctm[5] - 4) < 0.001, "垂直位移应为 Boundary 的 y");
    }

    @Test
    void keepsCompositeThatAlreadyDeclaresCtm() throws Exception {
        CompositeObject composite = composite("Boundary='90 4 30 20' CTM='1 0 0 1 5 6'");
        CT_VectorG vector = vector("<ofd:PathObject ID='3' Boundary='0 0 30 20'/>");

        assertFalse(OfdCompositePlacement.placeAtBoundary(composite, vector));

        Double[] ctm = composite.getCTM().toDouble();
        assertTrue(Math.abs(ctm[4] - 5) < 0.001);
        assertTrue(Math.abs(ctm[5] - 6) < 0.001);
    }

    @Test
    void keepsContentAlreadyPlacedAtBoundary() throws Exception {
        CompositeObject composite = composite("Boundary='90 4 30 20'");
        CT_VectorG vector = vector("<ofd:PathObject ID='3' Boundary='90 4 30 20'/>");

        assertFalse(OfdCompositePlacement.placeAtBoundary(composite, vector));
        assertNull(composite.getCTM());
    }

    @Test
    void ignoresBoundaryAtOrigin() throws Exception {
        CompositeObject composite = composite("Boundary='0 0 30 20'");
        CT_VectorG vector = vector("<ofd:PathObject ID='3' Boundary='0 0 30 20'/>");

        assertFalse(OfdCompositePlacement.placeAtBoundary(composite, vector));
        assertNull(composite.getCTM());
    }

    @Test
    void skipsWhenContentBoundsAreUnknown() throws Exception {
        CompositeObject composite = composite("Boundary='90 4 30 20'");
        CT_VectorG vector = vector("");

        assertFalse(OfdCompositePlacement.placeAtBoundary(composite, vector));
        assertNull(composite.getCTM());
    }

    @Test
    void readsContentBoundsThroughNestedPageBlocks() throws Exception {
        CompositeObject composite = composite("Boundary='90 4 30 20'");
        CT_VectorG vector = vector(
                "<ofd:PageBlock ID='1007'><ofd:PathObject ID='3' Boundary='0 0 30 20'/></ofd:PageBlock>");

        assertTrue(OfdCompositePlacement.placeAtBoundary(composite, vector));
        assertNotNull(composite.getCTM());
    }

    private CompositeObject composite(String attributes) throws Exception {
        String xml = "<ofd:CompositeObject xmlns:ofd='http://www.ofdspec.org/2016' "
                + "ID='1001' ResourceID='1111' " + attributes + "/>";
        return new CompositeObject(DocumentHelper.parseText(xml).getRootElement());
    }

    private CT_VectorG vector(String children) throws Exception {
        String xml = "<ofd:CompositeGraphicUnit xmlns:ofd='http://www.ofdspec.org/2016' "
                + "ID='1111' Width='210' Height='297'>"
                + "<ofd:Content ID='1005' Type='Body'><ofd:PageBlock ID='1006'>"
                + children
                + "</ofd:PageBlock></ofd:Content></ofd:CompositeGraphicUnit>";
        return new CT_VectorG(DocumentHelper.parseText(xml).getRootElement());
    }
}

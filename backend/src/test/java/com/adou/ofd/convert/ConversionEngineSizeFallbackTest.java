package com.adou.ofd.convert;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConversionEngineSizeFallbackTest {

    private static final long MB = 1024L * 1024L;

    @Test
    void keepsNormalVectorPdf() {
        assertFalse(ConversionEngine.isOversizedVectorPdf(60 * MB, 3));
        assertFalse(ConversionEngine.isOversizedVectorPdf(100 * MB, 10));
    }

    @Test
    void fallsBackForPathologicalVectorPdf() {
        assertTrue(ConversionEngine.isOversizedVectorPdf(70 * MB, 1));
        assertTrue(ConversionEngine.isOversizedVectorPdf(162 * MB, 3));
    }

    @Test
    void respectsPerPageFloor() {
        assertFalse(ConversionEngine.isOversizedVectorPdf(70 * MB, 4));
    }
}

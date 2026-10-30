package com.adou.ofd.config;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TokenFilterTest {

    private final TokenFilter filter = new TokenFilter("secret-token");

    @Test
    void rejectsMissingToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean(false);
        FilterChain chain = (req, res) -> reached.set(true);

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertFalse(reached.get());
    }

    @Test
    void acceptsHeaderToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/health");
        request.addHeader("X-ADou-Token", "secret-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean(false);

        filter.doFilter(request, response, (req, res) -> reached.set(true));

        assertTrue(reached.get());
    }

    @Test
    void acceptsQueryTokenForImages() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/documents/1/pages/1");
        request.setParameter("token", "secret-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean(false);

        filter.doFilter(request, response, (req, res) -> reached.set(true));

        assertTrue(reached.get());
    }

    @Test
    void doesNotBlockCorsPreflight() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/documents/demo");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean(false);

        filter.doFilter(request, response, (req, res) -> reached.set(true));

        assertTrue(reached.get());
        assertTrue(response.getStatus() < 400);
    }
}

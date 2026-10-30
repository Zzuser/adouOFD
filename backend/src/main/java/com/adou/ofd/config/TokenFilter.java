package com.adou.ofd.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * 保护本地引擎：Electron 每次启动生成随机 Token，所有 /api 请求必须携带。
 * 图片请求无法自定义 Header，因此同样接受 ?token=。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TokenFilter extends OncePerRequestFilter {

    private final byte[] expectedToken;

    public TokenFilter(@Value("${adou.token:}") String token) {
        this.expectedToken = token.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean unprotected = expectedToken.length == 0
                || !request.getRequestURI().startsWith("/api/")
                || "OPTIONS".equalsIgnoreCase(request.getMethod());
        if (unprotected) {
            chain.doFilter(request, response);
            return;
        }

        String provided = request.getHeader("X-ADou-Token");
        if (provided == null || provided.isBlank()) {
            provided = request.getParameter("token");
        }
        if (provided != null
                && MessageDigest.isEqual(expectedToken, provided.getBytes(StandardCharsets.UTF_8))) {
            chain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"本地引擎访问令牌无效\"}");
    }
}

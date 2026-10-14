package com.donni.api.security;

import java.io.ByteArrayInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import org.springframework.web.filter.OncePerRequestFilter;

import com.donni.api.common.ErrorWriter;
import com.donni.api.common.PhoneNumbers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

public class RateLimitFilter extends OncePerRequestFilter {

    private static final String PREFIX = "/api/v1/auth/";
    private static final int MAX_BODY_BYTES = 16 * 1024;

    private final TokenBucketLimiter limiter;
    private final ObjectMapper mapper;

    public RateLimitFilter(TokenBucketLimiter limiter, ObjectMapper mapper) {
        this.limiter = limiter;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(PREFIX) || "GET".equals(request.getMethod())
                || "OPTIONS".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) {
            ErrorWriter.write(mapper, response, 413, "validation_failed", "Corps de requête trop volumineux");
            return;
        }
        boolean allowed = limiter.tryAcquire("ip:" + request.getRemoteAddr());
        String phoneKey = phoneKey(body);
        if (allowed && phoneKey != null) {
            allowed = limiter.tryAcquire("phone:" + phoneKey);
        }
        if (!allowed) {
            response.setHeader("Retry-After", Long.toString(limiter.secondsUntilNextToken()));
            ErrorWriter.write(mapper, response, 429, "rate_limited", "Trop de tentatives, réessayez dans un instant");
            return;
        }
        chain.doFilter(new CachedBodyRequest(request, body), response);
    }

    private String phoneKey(byte[] body) {
        if (body.length == 0) {
            return null;
        }
        try {
            JsonNode phone = mapper.readTree(body).path("phone");
            if (!phone.isTextual()) {
                return null;
            }
            String raw = phone.asText();
            return PhoneNumbers.normalize(raw).orElseGet(() -> raw.length() > 32 ? raw.substring(0, 32) : raw);
        } catch (IOException e) {
            return null;
        }
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {

        private final byte[] body;

        CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream source = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return source.read();
                }

                @Override
                public int read(byte[] buffer, int offset, int length) {
                    return source.read(buffer, offset, length);
                }

                @Override
                public boolean isFinished() {
                    return source.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException();
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }
    }
}

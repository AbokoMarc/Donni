package com.donni.api.security;

import java.io.IOException;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.donni.api.common.ErrorWriter;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper mapper;

    public ApiAuthenticationEntryPoint(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        String message = exception.getMessage();
        boolean expired = message != null && message.contains("expired");
        response.setHeader("WWW-Authenticate", "Bearer");
        ErrorWriter.write(mapper, response, 401, expired ? "token_expired" : "unauthorized",
                expired ? "Session expirée" : "Authentification requise");
    }
}

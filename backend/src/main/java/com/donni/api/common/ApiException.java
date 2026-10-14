package com.donni.api.common;

import java.util.Map;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final transient Map<String, String> fields;
    private final transient Object server;

    private ApiException(HttpStatus status, String code, String message, Map<String, String> fields, Object server) {
        super(message);
        this.status = status;
        this.code = code;
        this.fields = fields;
        this.server = server;
    }

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null, null);
    }

    public static ApiException validation(Map<String, String> fields) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation_failed", "Données invalides", fields, null);
    }

    public static ApiException validation(String field, String message) {
        return validation(Map.of(field, message));
    }

    public static ApiException conflict(Object server) {
        return new ApiException(HttpStatus.CONFLICT, "version_conflict",
                "La version envoyée n'est plus celle du serveur", null, server);
    }

    public static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", "Ressource introuvable");
    }

    public static ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Accès refusé");
    }

    public static ApiException unauthorized() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Authentification requise");
    }

    public static ApiException unavailable(String code, String message) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, code, message);
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, String> fields() {
        return fields;
    }

    public Object server() {
        return server;
    }
}

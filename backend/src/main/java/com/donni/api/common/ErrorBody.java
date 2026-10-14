package com.donni.api.common;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorBody(int status, String code, String message, Map<String, String> fields, Object server) {

    public static ErrorBody of(int status, String code, String message) {
        return new ErrorBody(status, code, message, null, null);
    }
}

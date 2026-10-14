package com.donni.api.whatsapp;

import java.nio.charset.StandardCharsets;

import com.donni.api.common.Hashing;

public final class WebhookSignature {

    private static final String PREFIX = "sha256=";

    private WebhookSignature() {
    }

    public static boolean verify(byte[] rawBody, String header, String appSecret) {
        if (header == null || !header.startsWith(PREFIX) || appSecret == null || appSecret.isEmpty()) {
            return false;
        }
        String expected = Hashing.hmacSha256Hex(appSecret.getBytes(StandardCharsets.UTF_8), rawBody);
        return Hashing.constantTimeEquals(expected, header.substring(PREFIX.length()).toLowerCase());
    }
}

package com.donni.api.whatsapp;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import com.donni.api.common.Hashing;

class WebhookSignatureTest {

    private static final String SECRET = "app-secret";
    private static final byte[] BODY = "{\"entry\":[]}".getBytes(StandardCharsets.UTF_8);

    private static String sign(byte[] body, String secret) {
        return "sha256=" + Hashing.hmacSha256Hex(secret.getBytes(StandardCharsets.UTF_8), body);
    }

    @Test
    void acceptsAValidSignature() {
        assertTrue(WebhookSignature.verify(BODY, sign(BODY, SECRET), SECRET));
    }

    @Test
    void rejectsATamperedBody() {
        assertFalse(WebhookSignature.verify("{\"entry\":[1]}".getBytes(StandardCharsets.UTF_8), sign(BODY, SECRET), SECRET));
    }

    @Test
    void rejectsAWrongSecretMissingHeaderOrWrongPrefix() {
        assertFalse(WebhookSignature.verify(BODY, sign(BODY, "other"), SECRET));
        assertFalse(WebhookSignature.verify(BODY, null, SECRET));
        assertFalse(WebhookSignature.verify(BODY, sign(BODY, SECRET).substring(7), SECRET));
        assertFalse(WebhookSignature.verify(BODY, sign(BODY, SECRET), ""));
    }
}

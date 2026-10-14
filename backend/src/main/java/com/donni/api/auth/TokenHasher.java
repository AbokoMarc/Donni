package com.donni.api.auth;

import java.nio.charset.StandardCharsets;

import org.springframework.stereotype.Component;

import com.donni.api.common.Hashing;
import com.donni.api.config.DonniProperties;

@Component
public class TokenHasher {

    private final byte[] pepper;

    public TokenHasher(DonniProperties properties) {
        String value = properties.jwt().refreshPepper();
        this.pepper = value == null ? new byte[0] : value.getBytes(StandardCharsets.UTF_8);
    }

    public String hash(String input) {
        return pepper.length == 0
                ? Hashing.sha256Hex(input)
                : Hashing.hmacSha256Hex(pepper, input.getBytes(StandardCharsets.UTF_8));
    }
}

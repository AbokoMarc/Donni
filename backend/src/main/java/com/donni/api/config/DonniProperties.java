package com.donni.api.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("donni")
public record DonniProperties(
        String timezone,
        String dispatchToken,
        Jwt jwt,
        Cors cors,
        Fcm fcm,
        Whatsapp whatsapp) {

    public record Jwt(String secret, String refreshPepper, Duration accessTtl, Duration refreshTtl) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    public record Fcm(String projectId, String clientEmail, String privateKey) {

        public boolean configured() {
            return notBlank(projectId) && notBlank(clientEmail) && notBlank(privateKey);
        }
    }

    public record Whatsapp(String mode, String phoneNumberId, String businessAccountId, String accessToken,
                           String appSecret, String verifyToken, String apiVersion) {
    }

    static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}

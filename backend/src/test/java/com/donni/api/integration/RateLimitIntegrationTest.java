package com.donni.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

@TestPropertySource(properties = "donni.auth-rate-limit-per-minute=10")
class RateLimitIntegrationTest extends AbstractIntegrationTest {

    @Test
    void authRoutesAreLimitedPerNumber() throws Exception {
        String phone = newPhone();
        int refused = 0;
        for (int i = 0; i < 12; i++) {
            MvcResult result = postJson("/api/v1/auth/login", null,
                    "{\"phone\":\"%s\",\"password\":\"incorrect-incorrect\"}".formatted(phone));
            if (result.getResponse().getStatus() == 429) {
                refused++;
                assertEquals("rate_limited", json(result).get("code").asText());
                assertTrue(result.getResponse().getHeader("Retry-After") != null);
            }
        }
        assertTrue(refused >= 2, "attendu au moins 2 refus, obtenu " + refused);
    }
}

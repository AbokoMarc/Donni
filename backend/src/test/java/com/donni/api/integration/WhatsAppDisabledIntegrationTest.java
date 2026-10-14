package com.donni.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

@TestPropertySource(properties = "donni.whatsapp.mode=disabled")
class WhatsAppDisabledIntegrationTest extends AbstractIntegrationTest {

    @Test
    void everythingElseWorksAndWhatsAppRoutesRefuseCleanly() throws Exception {
        Session user = register(newPhone());

        assertEquals("disabled", json(getJson("/api/v1/whatsapp/status", user.accessToken())).get("mode").asText());
        assertEquals(503, postJson("/api/v1/whatsapp/test", user.accessToken(), "").getResponse().getStatus());
        assertEquals(200, getJson("/api/v1/dashboard", user.accessToken()).getResponse().getStatus());

        MvcResult dispatch = perform(post("/api/v1/internal/whatsapp/dispatch").header("X-Dispatch-Token", "test-dispatch-token"));
        assertEquals(503, dispatch.getResponse().getStatus());
    }

    @Test
    void passwordResetReportsThatTheChannelIsUnavailable() throws Exception {
        Session user = register(newPhone());

        MvcResult forgot = postJson("/api/v1/auth/password/forgot", null, "{\"phone\":\"" + user.phone() + "\"}");

        assertEquals(503, forgot.getResponse().getStatus());
        assertEquals("reset_channel_unavailable", json(forgot).get("code").asText());
        assertEquals(0, jdbc.queryForObject("select count(*) from whatsapp_messages", Integer.class));
    }
}

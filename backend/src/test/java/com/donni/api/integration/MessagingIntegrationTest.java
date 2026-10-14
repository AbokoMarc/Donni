package com.donni.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import com.donni.api.common.Hashing;
import com.fasterxml.jackson.databind.JsonNode;

class MessagingIntegrationTest extends AbstractIntegrationTest {

    private static final String DISPATCH = "/api/v1/internal/whatsapp/dispatch";

    private MvcResult dispatch(String token) throws Exception {
        var request = post(DISPATCH);
        if (token != null) {
            request = request.header("X-Dispatch-Token", token);
        }
        return perform(request);
    }

    private void pushReminder(Session user, UUID reminder, boolean viaWhatsapp, Instant fireAt) throws Exception {
        postJson("/api/v1/sync", user.accessToken(), """
                {"cursor":0,"changes":[{"entity":"reminders","id":"%s","baseVersion":0,"data":{
                 "targetType":"goal","label":"Devenir chef projet","fireAt":"%s","status":"scheduled","viaWhatsapp":%s}}]}"""
                .formatted(reminder, fireAt, viaWhatsapp));
    }

    private void optIn(Session user) throws Exception {
        long version = json(getJson("/api/v1/settings", user.accessToken())).get("version").asLong();
        MvcResult result = putJson("/api/v1/settings", user.accessToken(),
                "{\"baseVersion\":%d,\"focusMode\":false,\"whatsappOptIn\":true,\"language\":\"fr\"}".formatted(version));
        assertEquals(200, result.getResponse().getStatus(), body(result));
    }

    @Test
    void fcmTestRouteAnswers503WhenFcmIsNotConfigured() throws Exception {
        Session user = register(newPhone());

        MvcResult result = postJson("/api/v1/notifications/test", user.accessToken(), "");

        assertEquals(503, result.getResponse().getStatus());
        assertEquals("service_unavailable", json(result).get("code").asText());
    }

    @Test
    void devicesAndPreferences() throws Exception {
        Session user = register(newPhone());

        assertEquals(204, putJson("/api/v1/devices", user.accessToken(),
                "{\"fcmToken\":\"jeton-" + UUID.randomUUID() + "\",\"appVersion\":\"1.0.0\"}").getResponse().getStatus());
        assertEquals(422, putJson("/api/v1/devices", user.accessToken(), "{\"fcmToken\":\"\"}").getResponse().getStatus());

        String token = "jeton-" + UUID.randomUUID();
        putJson("/api/v1/devices", user.accessToken(), "{\"fcmToken\":\"" + token + "\"}");
        putJson("/api/v1/devices", user.accessToken(), "{\"fcmToken\":\"" + token + "\",\"appVersion\":\"1.0.1\"}");
        assertEquals(1, jdbc.queryForObject("select count(*) from devices where fcm_token = ?", Integer.class, token));
        assertEquals(204, deleteJson("/api/v1/devices/" + token, user.accessToken()).getResponse().getStatus());
        assertEquals(0, jdbc.queryForObject("select count(*) from devices where fcm_token = ?", Integer.class, token));

        JsonNode defaults = json(getJson("/api/v1/notifications/preferences", user.accessToken()));
        assertEquals(3, defaults.size());
        assertTrue(defaults.get(0).get("enabled").asBoolean());

        MvcResult updated = putJson("/api/v1/notifications/preferences", user.accessToken(),
                "[{\"channel\":\"fcm\",\"type\":\"sync_available\",\"enabled\":false}]");
        assertEquals(200, updated.getResponse().getStatus(), body(updated));
        boolean syncEnabled = true;
        for (JsonNode preference : json(getJson("/api/v1/notifications/preferences", user.accessToken()))) {
            if ("sync_available".equals(preference.get("type").asText())) {
                syncEnabled = preference.get("enabled").asBoolean();
            }
        }
        assertEquals(false, syncEnabled);
        assertEquals(422, putJson("/api/v1/notifications/preferences", user.accessToken(),
                "[{\"channel\":\"sms\",\"type\":\"x\",\"enabled\":true}]").getResponse().getStatus());

        assertEquals(0, json(getJson("/api/v1/notifications", user.accessToken())).size());
        assertEquals(404, postJson("/api/v1/notifications/" + UUID.randomUUID() + "/read", user.accessToken(), "")
                .getResponse().getStatus());
    }

    @Test
    void whatsAppStatusAndTestMessageInMockMode() throws Exception {
        Session user = register(newPhone());

        assertEquals("mock", json(getJson("/api/v1/whatsapp/status", user.accessToken())).get("mode").asText());
        MvcResult sent = postJson("/api/v1/whatsapp/test", user.accessToken(), "");

        assertEquals(200, sent.getResponse().getStatus(), body(sent));
        assertTrue(json(sent).get("providerId").asText().startsWith("mock-"));
        assertEquals("sent", jdbc.queryForObject(
                "select status from whatsapp_messages where user_id = ?::uuid and template = 'donni_test'",
                String.class, user.userId()));
    }

    @Test
    void webhookVerificationAndSignedStatusUpdates() throws Exception {
        Session user = register(newPhone());
        String providerId = json(postJson("/api/v1/whatsapp/test", user.accessToken(), "")).get("providerId").asText();

        MvcResult verified = perform(get("/api/v1/webhooks/whatsapp").param("hub.mode", "subscribe")
                .param("hub.verify_token", "test-verify-token").param("hub.challenge", "12345"));
        assertEquals(200, verified.getResponse().getStatus());
        assertEquals("12345", body(verified));
        assertEquals(403, perform(get("/api/v1/webhooks/whatsapp").param("hub.mode", "subscribe")
                .param("hub.verify_token", "faux").param("hub.challenge", "12345")).getResponse().getStatus());

        byte[] payload = ("{\"entry\":[{\"changes\":[{\"value\":{\"statuses\":[{\"id\":\"%s\",\"status\":\"delivered\"}]}}]}]}"
                .formatted(providerId)).getBytes(StandardCharsets.UTF_8);
        String signature = "sha256=" + Hashing.hmacSha256Hex("test-app-secret".getBytes(StandardCharsets.UTF_8), payload);

        assertEquals(403, perform(post("/api/v1/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON)
                .content(payload)).getResponse().getStatus());
        assertEquals(403, perform(post("/api/v1/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON)
                .header("X-Hub-Signature-256", "sha256=" + "0".repeat(64)).content(payload)).getResponse().getStatus());
        assertEquals("sent", jdbc.queryForObject("select status from whatsapp_messages where provider_id = ?",
                String.class, providerId));

        assertEquals(200, perform(post("/api/v1/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON)
                .header("X-Hub-Signature-256", signature).content(payload)).getResponse().getStatus());
        assertEquals("delivered", jdbc.queryForObject("select status from whatsapp_messages where provider_id = ?",
                String.class, providerId));
    }

    @Test
    void dispatchSendsDueRemindersOnceForOptedInUsers() throws Exception {
        Session optedIn = register(newPhone());
        Session optedOut = register(newPhone());
        optIn(optedIn);
        UUID due = UUID.randomUUID();
        UUID future = UUID.randomUUID();
        UUID notWhatsapp = UUID.randomUUID();
        UUID ignored = UUID.randomUUID();
        pushReminder(optedIn, due, true, Instant.now().minusSeconds(60));
        pushReminder(optedIn, future, true, Instant.now().plusSeconds(3600));
        pushReminder(optedIn, notWhatsapp, false, Instant.now().minusSeconds(60));
        pushReminder(optedOut, ignored, true, Instant.now().minusSeconds(60));

        assertEquals(403, dispatch(null).getResponse().getStatus());
        assertEquals(403, dispatch("mauvais-jeton").getResponse().getStatus());

        MvcResult first = dispatch("test-dispatch-token");
        assertEquals(200, first.getResponse().getStatus(), body(first));
        assertEquals(1, json(first).get("sent").asInt());
        assertEquals(0, json(first).get("failed").asInt());

        JsonNode reminder = json(getJson("/api/v1/reminders/" + due, optedIn.accessToken()));
        assertTrue(!reminder.get("whatsappSentAt").isNull());
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from whatsapp_messages where user_id = ?::uuid and template = 'donni_rappel_objectif' and status = 'sent'",
                Integer.class, optedIn.userId()));
        assertEquals(0, jdbc.queryForObject("select count(*) from whatsapp_messages where user_id = ?::uuid",
                Integer.class, optedOut.userId()));

        long syncedVersion = reminder.get("version").asLong();
        JsonNode pulled = json(postJson("/api/v1/sync", optedIn.accessToken(), "{\"cursor\":0,\"changes\":[]}"));
        boolean seen = false;
        for (JsonNode change : pulled.get("changes")) {
            if (change.get("id").asText().equals(due.toString()) && change.get("version").asLong() == syncedVersion) {
                seen = !change.get("data").get("whatsappSentAt").isNull();
            }
        }
        assertTrue(seen);

        MvcResult second = dispatch("test-dispatch-token");
        assertEquals(0, json(second).get("sent").asInt());
    }
}

package com.donni.api.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;

import com.donni.api.whatsapp.WhatsAppClient;
import com.donni.api.whatsapp.WhatsAppTemplate;

class AuthIntegrationTest extends AbstractIntegrationTest {

    @MockitoSpyBean
    WhatsAppClient whatsAppClient;

    private MvcResult refresh(String token) throws Exception {
        return postJson("/api/v1/auth/refresh", null, "{\"refreshToken\":\"" + token + "\"}");
    }

    @Test
    void registerThenReadProfile() throws Exception {
        String phone = newPhone();
        MvcResult result = postJson("/api/v1/auth/register", null,
                "{\"fullName\":\"  Marc  \",\"phone\":\"%s\",\"password\":\"%s\"}".formatted(phone.substring(4), PASSWORD));

        assertEquals(201, result.getResponse().getStatus());
        assertEquals(900, json(result).get("expiresIn").asInt());
        assertEquals("Marc", json(result).get("user").get("fullName").asText());
        assertEquals(phone, json(result).get("user").get("phone").asText());

        Session session = session(json(result), phone);
        MvcResult me = getJson("/api/v1/auth/me", session.accessToken());
        assertEquals(200, me.getResponse().getStatus());
        assertEquals(phone, json(me).get("phone").asText());
        assertEquals(session.userId(), json(me).get("id").asText());
        assertFalse(body(me).contains("password"));
    }

    @Test
    void registrationRefusesDuplicatesAndInvalidData() throws Exception {
        String phone = newPhone();
        register(phone);

        MvcResult duplicate = postJson("/api/v1/auth/register", null,
                "{\"fullName\":\"Autre\",\"phone\":\"%s\",\"password\":\"%s\"}".formatted(phone, PASSWORD));
        assertEquals(409, duplicate.getResponse().getStatus());
        assertEquals("phone_taken", json(duplicate).get("code").asText());

        MvcResult invalid = postJson("/api/v1/auth/register", null,
                "{\"fullName\":\"M\",\"phone\":\"12\",\"password\":\"court\"}");
        assertEquals(422, invalid.getResponse().getStatus());
        assertEquals("validation_failed", json(invalid).get("code").asText());
        assertTrue(json(invalid).get("fields").has("fullName"));
        assertTrue(json(invalid).get("fields").has("password"));

        MvcResult badPhone = postJson("/api/v1/auth/register", null,
                "{\"fullName\":\"Marc\",\"phone\":\"12\",\"password\":\"%s\"}".formatted(PASSWORD));
        assertTrue(json(badPhone).get("fields").has("phone"));
    }

    @Test
    void loginFailuresDoNotRevealWhetherTheAccountExists() throws Exception {
        String phone = newPhone();
        register(phone);

        MvcResult wrongPassword = postJson("/api/v1/auth/login", null,
                "{\"phone\":\"%s\",\"password\":\"mauvais-mot-de-passe\"}".formatted(phone));
        MvcResult unknown = postJson("/api/v1/auth/login", null,
                "{\"phone\":\"%s\",\"password\":\"mauvais-mot-de-passe\"}".formatted(newPhone()));

        assertEquals(401, wrongPassword.getResponse().getStatus());
        assertEquals(body(wrongPassword), body(unknown));
        assertEquals("invalid_credentials", json(unknown).get("code").asText());
    }

    @Test
    void protectedRoutesNeedAValidToken() throws Exception {
        MvcResult missing = getJson("/api/v1/auth/me", null);
        assertEquals(401, missing.getResponse().getStatus());
        assertEquals("unauthorized", json(missing).get("code").asText());

        MvcResult garbage = getJson("/api/v1/auth/me", "pas.un.jeton");
        assertEquals(401, garbage.getResponse().getStatus());
    }

    @Test
    void refreshRotatesAndReuseRevokesTheFamily() throws Exception {
        Session first = register(newPhone());

        MvcResult rotated = refresh(first.refreshToken());
        assertEquals(200, rotated.getResponse().getStatus());
        String second = json(rotated).get("refreshToken").asText();
        assertNotEquals(first.refreshToken(), second);

        MvcResult reuse = refresh(first.refreshToken());
        assertEquals(401, reuse.getResponse().getStatus());
        assertEquals("refresh_reused", json(reuse).get("code").asText());

        MvcResult afterRevocation = refresh(second);
        assertEquals(401, afterRevocation.getResponse().getStatus());
    }

    @Test
    void logoutRevokesTheSession() throws Exception {
        Session session = register(newPhone());

        MvcResult logout = postJson("/api/v1/auth/logout", null, "{\"refreshToken\":\"" + session.refreshToken() + "\"}");
        assertEquals(204, logout.getResponse().getStatus());

        assertEquals(401, refresh(session.refreshToken()).getResponse().getStatus());
    }

    @Test
    void passwordChangeRevokesOtherSessionsOnly() throws Exception {
        String phone = newPhone();
        Session current = register(phone);
        Session other = login(phone, PASSWORD, null);

        MvcResult wrong = postJson("/api/v1/auth/password/change", current.accessToken(),
                "{\"currentPassword\":\"incorrect-incorrect\",\"newPassword\":\"nouveau-mot-de-passe\"}");
        assertEquals(422, wrong.getResponse().getStatus());

        MvcResult changed = postJson("/api/v1/auth/password/change", current.accessToken(),
                "{\"currentPassword\":\"%s\",\"newPassword\":\"nouveau-mot-de-passe\"}".formatted(PASSWORD));
        assertEquals(204, changed.getResponse().getStatus());

        assertEquals(200, refresh(current.refreshToken()).getResponse().getStatus());
        assertEquals(401, refresh(other.refreshToken()).getResponse().getStatus());
        assertEquals(401, postJson("/api/v1/auth/login", null,
                "{\"phone\":\"%s\",\"password\":\"%s\"}".formatted(phone, PASSWORD)).getResponse().getStatus());
        login(phone, "nouveau-mot-de-passe", null);
    }

    @Test
    void passwordResetByWhatsAppCode() throws Exception {
        String phone = newPhone();
        register(phone);

        MvcResult forgot = postJson("/api/v1/auth/password/forgot", null, "{\"phone\":\"" + phone + "\"}");
        assertEquals(202, forgot.getResponse().getStatus());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> params = ArgumentCaptor.forClass(List.class);
        verify(whatsAppClient).send(any(), eq(phone), eq(WhatsAppTemplate.RESET_CODE), params.capture());
        String code = params.getValue().get(0);
        assertTrue(code.matches("[0-9]{6}"));

        String wrongCode = code.equals("000000") ? "000001" : "000000";
        MvcResult wrong = postJson("/api/v1/auth/password/reset", null,
                "{\"phone\":\"%s\",\"code\":\"%s\",\"newPassword\":\"reinitialise-123\"}".formatted(phone, wrongCode));
        assertEquals(400, wrong.getResponse().getStatus());
        assertEquals("invalid_reset_code", json(wrong).get("code").asText());

        MvcResult ok = postJson("/api/v1/auth/password/reset", null,
                "{\"phone\":\"%s\",\"code\":\"%s\",\"newPassword\":\"reinitialise-123\"}".formatted(phone, code));
        assertEquals(204, ok.getResponse().getStatus());
        login(phone, "reinitialise-123", null);

        MvcResult replay = postJson("/api/v1/auth/password/reset", null,
                "{\"phone\":\"%s\",\"code\":\"%s\",\"newPassword\":\"encore-un-autre-1\"}".formatted(phone, code));
        assertEquals(400, replay.getResponse().getStatus());
    }

    @Test
    void forgotPasswordAnswersTheSameForUnknownNumbers() throws Exception {
        String unknown = newPhone();

        MvcResult forgot = postJson("/api/v1/auth/password/forgot", null, "{\"phone\":\"" + unknown + "\"}");

        assertEquals(202, forgot.getResponse().getStatus());
        verify(whatsAppClient, never()).send(any(), eq(unknown), any(), any());
    }

    @Test
    void resetCodeIsBlockedAfterFiveWrongAttempts() throws Exception {
        String phone = newPhone();
        register(phone);
        postJson("/api/v1/auth/password/forgot", null, "{\"phone\":\"" + phone + "\"}");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> params = ArgumentCaptor.forClass(List.class);
        verify(whatsAppClient).send(any(), eq(phone), eq(WhatsAppTemplate.RESET_CODE), params.capture());
        String code = params.getValue().get(0);
        String wrongCode = code.equals("000000") ? "000001" : "000000";

        for (int i = 0; i < 5; i++) {
            postJson("/api/v1/auth/password/reset", null,
                    "{\"phone\":\"%s\",\"code\":\"%s\",\"newPassword\":\"reinitialise-123\"}".formatted(phone, wrongCode));
        }
        MvcResult blocked = postJson("/api/v1/auth/password/reset", null,
                "{\"phone\":\"%s\",\"code\":\"%s\",\"newPassword\":\"reinitialise-123\"}".formatted(phone, code));

        assertEquals(400, blocked.getResponse().getStatus());
    }

    @Test
    void accountDeletionRemovesEverything() throws Exception {
        String phone = newPhone();
        Session session = register(phone);
        postJson("/api/v1/sync", session.accessToken(), """
                {"cursor":0,"changes":[{"entity":"notes","id":"6f1c2b1a-1d2e-4f3a-9b4c-5d6e7f8a9b0c","baseVersion":0,
                 "data":{"title":"a","body":"b"}}]}""");

        MvcResult wrong = perform(withToken(delete("/api/v1/auth/account"), session.accessToken())
                .contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"incorrect-incorrect\"}"));
        assertEquals(422, wrong.getResponse().getStatus());

        MvcResult deleted = perform(withToken(delete("/api/v1/auth/account"), session.accessToken())
                .contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"" + PASSWORD + "\"}"));
        assertEquals(204, deleted.getResponse().getStatus());

        assertEquals(0, jdbc.queryForObject("select count(*) from notes where user_id = ?::uuid", Integer.class, session.userId()));
        assertEquals(401, getJson("/api/v1/auth/me", session.accessToken()).getResponse().getStatus());
        assertEquals(401, postJson("/api/v1/auth/login", null,
                "{\"phone\":\"%s\",\"password\":\"%s\"}".formatted(phone, PASSWORD)).getResponse().getStatus());
    }

    @Test
    void newDeviceLoginDoesNotBreakWithoutFcm() throws Exception {
        String phone = newPhone();
        register(phone);

        Session session = login(phone, PASSWORD, "6f1c2b1a-1d2e-4f3a-9b4c-5d6e7f8a9b0c");

        assertEquals(200, getJson("/api/v1/auth/me", session.accessToken()).getResponse().getStatus());
    }
}

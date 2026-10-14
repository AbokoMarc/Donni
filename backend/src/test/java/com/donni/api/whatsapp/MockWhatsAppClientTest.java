package com.donni.api.whatsapp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class MockWhatsAppClientTest {

    private final WhatsAppMessageRepository repository = mock(WhatsAppMessageRepository.class);
    private final MockWhatsAppClient client = new MockWhatsAppClient(repository,
            Clock.fixed(Instant.parse("2026-10-05T10:00:00Z"), ZoneOffset.UTC));

    private WhatsAppMessage sendAndCapture(WhatsAppTemplate template, List<String> params) {
        String providerId = client.send(UUID.randomUUID(), "+237600000000", template, params);
        ArgumentCaptor<WhatsAppMessage> saved = ArgumentCaptor.forClass(WhatsAppMessage.class);
        verify(repository).save(saved.capture());
        assertEquals(providerId, saved.getValue().getProviderId());
        return saved.getValue();
    }

    @Test
    void recordsASentMessageWithAMockProviderId() {
        WhatsAppMessage message = sendAndCapture(WhatsAppTemplate.TASK_REMINDER, List.of("Deep work", "10"));

        assertEquals("sent", message.getStatus());
        assertTrue(message.getProviderId().startsWith("mock-"));
        assertEquals("donni_rappel_tache", message.getTemplate());
        assertEquals("Deep work", message.getParams().get("1"));
        assertEquals("10", message.getParams().get("2"));
        assertEquals("+237600000000", message.getToPhone());
    }

    @Test
    void doesNotKeepResetCodes() {
        WhatsAppMessage message = sendAndCapture(WhatsAppTemplate.RESET_CODE, List.of("123456"));

        assertEquals("donni_code_reinitialisation", message.getTemplate());
        assertTrue(!message.getParams().containsValue("123456"));
    }

    @Test
    void reportsItsMode() {
        assertEquals("mock", client.mode());
    }

    @Test
    void providerStatusNeverMovesBackwards() {
        WhatsAppMessage message = sendAndCapture(WhatsAppTemplate.TEST, List.of());
        Instant now = Instant.parse("2026-10-05T10:05:00Z");

        message.applyProviderStatus("read", null, now);
        message.applyProviderStatus("delivered", null, now);
        message.applyProviderStatus("failed", "late", now);

        assertEquals("read", message.getStatus());
    }
}

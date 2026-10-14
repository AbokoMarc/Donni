package com.donni.api.whatsapp;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "donni.whatsapp", name = "mode", havingValue = "mock")
public class MockWhatsAppClient implements WhatsAppClient {

    private final WhatsAppMessageRepository messages;
    private final Clock clock;

    public MockWhatsAppClient(WhatsAppMessageRepository messages, Clock clock) {
        this.messages = messages;
        this.clock = clock;
    }

    @Override
    public String mode() {
        return "mock";
    }

    @Override
    public String send(UUID userId, String toPhone, WhatsAppTemplate template, List<String> params) {
        var now = clock.instant();
        WhatsAppMessage message = WhatsAppMessage.queued(userId, toPhone, template, params, now);
        String providerId = "mock-" + UUID.randomUUID();
        message.markSent(providerId, now);
        messages.save(message);
        return providerId;
    }
}

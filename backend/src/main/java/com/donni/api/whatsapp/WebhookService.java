package com.donni.api.whatsapp;

import java.io.IOException;
import java.time.Clock;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.donni.api.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class WebhookService {

    private final WhatsAppMessageRepository messages;
    private final ObjectMapper mapper;
    private final Clock clock;

    public WebhookService(WhatsAppMessageRepository messages, ObjectMapper mapper, Clock clock) {
        this.messages = messages;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public void applyStatuses(byte[] rawBody) {
        JsonNode root;
        try {
            root = mapper.readTree(rawBody);
        } catch (IOException e) {
            throw ApiException.validation("body", "JSON invalide");
        }
        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                for (JsonNode status : change.path("value").path("statuses")) {
                    String providerId = status.path("id").asText("");
                    String newStatus = status.path("status").asText("");
                    String reason = status.path("errors").path(0).path("title").asText(null);
                    messages.findByProviderId(providerId)
                            .ifPresent(message -> message.applyProviderStatus(newStatus, reason, clock.instant()));
                }
            }
        }
    }
}

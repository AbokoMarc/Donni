package com.donni.api.whatsapp;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import com.donni.api.config.DonniProperties;

@Service
public class WhatsAppService {

    private static final Set<String> MODES = Set.of("disabled", "mock", "live");

    private final WhatsAppClient client;

    public WhatsAppService(DonniProperties properties, ObjectProvider<WhatsAppClient> client) {
        String configured = properties.whatsapp().mode();
        if (configured != null && !configured.isBlank() && !MODES.contains(configured)) {
            throw new IllegalStateException("WHATSAPP_MODE doit valoir disabled, mock ou live");
        }
        this.client = client.getIfAvailable();
    }

    public boolean available() {
        return client != null;
    }

    public String mode() {
        return client == null ? "disabled" : client.mode();
    }

    public String send(UUID userId, String toPhone, WhatsAppTemplate template, List<String> params) {
        if (client == null) {
            throw new WhatsAppException("WhatsApp est désactivé");
        }
        if (params.size() != template.parameterCount()) {
            throw new IllegalArgumentException("Nombre de paramètres incorrect pour " + template.metaName());
        }
        return client.send(userId, toPhone, template, params);
    }
}

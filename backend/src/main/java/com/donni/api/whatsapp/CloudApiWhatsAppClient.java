package com.donni.api.whatsapp;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.donni.api.common.PhoneNumbers;
import com.donni.api.config.DonniProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "donni.whatsapp", name = "mode", havingValue = "live")
public class CloudApiWhatsAppClient implements WhatsAppClient {

    private static final Logger log = LoggerFactory.getLogger(CloudApiWhatsAppClient.class);
    private static final String BASE_URL = "https://graph.facebook.com";

    private final WhatsAppMessageRepository messages;
    private final Clock clock;
    private final ObjectMapper mapper;
    private final RestClient rest;
    private final String phoneNumberId;
    private final String apiVersion;
    private final String accessToken;

    public CloudApiWhatsAppClient(DonniProperties properties, WhatsAppMessageRepository messages, Clock clock,
                                  ObjectMapper mapper) {
        DonniProperties.Whatsapp config = properties.whatsapp();
        if (isBlank(config.phoneNumberId()) || isBlank(config.accessToken())) {
            throw new IllegalStateException(
                    "WHATSAPP_PHONE_NUMBER_ID et WHATSAPP_ACCESS_TOKEN sont requis quand WHATSAPP_MODE=live");
        }
        this.messages = messages;
        this.clock = clock;
        this.mapper = mapper;
        this.phoneNumberId = config.phoneNumberId().strip();
        this.apiVersion = isBlank(config.apiVersion()) ? "v21.0" : config.apiVersion().strip();
        this.accessToken = config.accessToken().strip();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.rest = RestClient.builder().baseUrl(BASE_URL).requestFactory(factory).build();
    }

    @Override
    public String mode() {
        return "live";
    }

    @Override
    public String send(UUID userId, String toPhone, WhatsAppTemplate template, List<String> params) {
        WhatsAppMessage message = messages.save(WhatsAppMessage.queued(userId, toPhone, template, params, clock.instant()));
        try {
            JsonNode response = rest.post()
                    .uri("/{version}/{phoneNumberId}/messages", apiVersion, phoneNumberId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload(toPhone, template, params))
                    .retrieve()
                    .body(JsonNode.class);
            String providerId = response == null ? null : response.path("messages").path(0).path("id").asText(null);
            if (providerId == null || providerId.isBlank()) {
                return fail(message, "Réponse sans identifiant de message");
            }
            message.markSent(providerId, clock.instant());
            messages.save(message);
            return providerId;
        } catch (RestClientResponseException e) {
            return fail(message, "HTTP " + e.getStatusCode().value() + " " + providerMessage(e.getResponseBodyAsString()));
        } catch (RestClientException e) {
            return fail(message, "Service WhatsApp injoignable");
        }
    }

    Map<String, Object> payload(String toPhone, WhatsAppTemplate template, List<String> params) {
        Map<String, Object> templateNode = new LinkedHashMap<>();
        templateNode.put("name", template.metaName());
        templateNode.put("language", Map.of("code", WhatsAppTemplate.LANGUAGE));
        if (!params.isEmpty()) {
            List<Map<String, String>> parameters = new ArrayList<>();
            params.forEach(value -> parameters.add(Map.of("type", "text", "text", value)));
            templateNode.put("components", List.of(Map.of("type", "body", "parameters", parameters)));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("to", PhoneNumbers.toWhatsAppId(toPhone));
        body.put("type", "template");
        body.put("template", templateNode);
        return body;
    }

    private String fail(WhatsAppMessage message, String reason) {
        message.markFailed(reason, clock.instant());
        messages.save(message);
        log.warn("Envoi WhatsApp en échec : {}", reason);
        throw new WhatsAppException(reason);
    }

    private String providerMessage(String body) {
        try {
            String text = mapper.readTree(body).path("error").path("message").asText("");
            return text.length() > 200 ? text.substring(0, 200) : text;
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

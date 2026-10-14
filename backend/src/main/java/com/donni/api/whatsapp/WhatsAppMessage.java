package com.donni.api.whatsapp;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "whatsapp_messages")
public class WhatsAppMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "to_phone", nullable = false)
    private String toPhone;

    @Column(nullable = false)
    private String template;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> params;

    @Column(name = "provider_id")
    private String providerId;

    @Column(nullable = false)
    private String status = "queued";

    private String error;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected WhatsAppMessage() {
    }

    public static WhatsAppMessage queued(UUID userId, String toPhone, WhatsAppTemplate template, List<String> params,
                                         Instant now) {
        WhatsAppMessage message = new WhatsAppMessage();
        message.userId = userId;
        message.toPhone = toPhone;
        message.template = template.metaName();
        message.params = new LinkedHashMap<>();
        for (int i = 0; i < params.size(); i++) {
            message.params.put(String.valueOf(i + 1), template.sensitive() ? "masqué" : params.get(i));
        }
        message.createdAt = now;
        message.updatedAt = now;
        return message;
    }

    public void markSent(String providerId, Instant now) {
        this.providerId = providerId;
        this.status = "sent";
        this.updatedAt = now;
    }

    public void markFailed(String reason, Instant now) {
        this.status = "failed";
        this.error = reason;
        this.updatedAt = now;
    }

    /** Un statut plus avancé n'est jamais écrasé par un accusé arrivé en retard. */
    public void applyProviderStatus(String newStatus, String reason, Instant now) {
        int current = rank(status);
        int incoming = rank(newStatus);
        boolean failure = "failed".equals(newStatus);
        if (incoming < 0 || (!failure && incoming <= current) || (failure && current >= rank("delivered"))) {
            return;
        }
        this.status = newStatus;
        this.error = failure ? reason : this.error;
        this.updatedAt = now;
    }

    private static int rank(String value) {
        return switch (value) {
            case "queued" -> 0;
            case "sent" -> 1;
            case "delivered" -> 2;
            case "read" -> 3;
            case "failed" -> 1;
            default -> -1;
        };
    }

    public UUID getId() {
        return id;
    }

    public String getTemplate() {
        return template;
    }

    public String getStatus() {
        return status;
    }

    public String getProviderId() {
        return providerId;
    }

    public Map<String, Object> getParams() {
        return params;
    }

    public String getToPhone() {
        return toPhone;
    }

    public UUID getUserId() {
        return userId;
    }
}

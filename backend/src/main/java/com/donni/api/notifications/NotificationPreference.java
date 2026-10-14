package com.donni.api.notifications;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "notification_preferences")
public class NotificationPreference {

    @Embeddable
    public static class Key implements Serializable {

        @Column(name = "user_id")
        private UUID userId;

        private String channel;

        private String type;

        protected Key() {
        }

        public Key(UUID userId, String channel, String type) {
            this.userId = userId;
            this.channel = channel;
            this.type = type;
        }

        public String getChannel() {
            return channel;
        }

        public String getType() {
            return type;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key key && Objects.equals(userId, key.userId)
                    && Objects.equals(channel, key.channel) && Objects.equals(type, key.type);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, channel, type);
        }
    }

    @EmbeddedId
    private Key id;

    @Column(nullable = false)
    private boolean enabled;

    protected NotificationPreference() {
    }

    public NotificationPreference(UUID userId, String channel, String type, boolean enabled) {
        this.id = new Key(userId, channel, type);
        this.enabled = enabled;
    }

    public Key getId() {
        return id;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}

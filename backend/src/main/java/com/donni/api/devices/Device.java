package com.donni.api.devices;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "devices")
public class Device {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "fcm_token", nullable = false)
    private String fcmToken;

    @Column(nullable = false)
    private String platform = "android";

    @Column(name = "app_version")
    private String appVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected Device() {
    }

    public Device(UUID userId, String fcmToken, String appVersion, Instant now) {
        this.userId = userId;
        this.fcmToken = fcmToken;
        this.appVersion = appVersion;
        this.createdAt = now;
        this.lastSeenAt = now;
    }

    public void claim(UUID userId, String appVersion, Instant now) {
        this.userId = userId;
        this.appVersion = appVersion;
        this.lastSeenAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getFcmToken() {
        return fcmToken;
    }
}

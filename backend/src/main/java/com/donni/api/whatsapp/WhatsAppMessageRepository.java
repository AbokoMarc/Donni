package com.donni.api.whatsapp;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WhatsAppMessageRepository extends JpaRepository<WhatsAppMessage, UUID> {

    Optional<WhatsAppMessage> findByProviderId(String providerId);
}

package com.donni.api.whatsapp;

import java.util.List;
import java.util.UUID;

public interface WhatsAppClient {

    String mode();

    /** Envoie un modèle, enregistre le message et renvoie l'identifiant fournisseur. */
    String send(UUID userId, String toPhone, WhatsAppTemplate template, List<String> params);
}

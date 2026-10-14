package com.donni.api.sync;

import java.util.UUID;

/** Prévient les autres appareils d'un utilisateur que des données ont changé. */
public interface SyncNotifier {

    void changesApplied(UUID userId);
}

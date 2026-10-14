# Notifications

Trois niveaux, du plus fiable au plus optionnel.

```
                    DONNI
                      │
          ┌───────────┴───────────┐
          │                       │
       LOCAL                   CLOUD
          │                       │
 Notifications              Synchronisation
 personnelles                   │
          │                  FCM / WhatsApp
          │                       │
          └───────────┬───────────┘
                      │
                 UTILISATEUR
```

## Niveau 1 : notifications locales (aucun serveur)

Tout rappel personnel prévisible est programmé sur le téléphone avec des notifications à déclencheur (Notifee, `TimestampTrigger`, alarme exacte Android). À l'heure dite, Android affiche la notification : le serveur peut être arrêté, le téléphone hors connexion.

Sont concernés : tâches et créneaux, routines, habitudes, objectifs (échéances), relances de contacts, seuils de budget (80 % et 100 %, évalués à l'enregistrement d'une dépense) et résumé du matin.

### Source de vérité : la table `reminders`

Chaque notification programmée correspond à une ligne `reminders` locale. Un module unique, `ReminderScheduler`, réconcilie la base et Android :

1. **Dérivation** : à chaque écriture d'une tâche, habitude, objectif, contact ou budget, les rappels attendus sont recalculés (fonction pure `deriveReminders`) et les lignes `reminders` créées, modifiées ou supprimées.
2. **Réconciliation** : `refresh()` compare les lignes `scheduled` futures aux notifications à déclencheur déjà enregistrées auprès d'Android (`getTriggerNotificationIds`). Il programme les manquantes, annule les orphelines, reprogramme celles dont l'heure a changé. L'identifiant de notification est dérivé de l'identifiant de la ligne (hash stable), donc l'opération est idempotente.
3. **Déclenchements de `refresh()`** : démarrage de l'application, retour au premier plan, fin de chaque synchronisation, changement de fuseau horaire ou d'heure, retour d'une permission.

Modifier `18:00` en `19:30` revient à modifier la tâche : le rappel `18:00` disparaît à la dérivation, `19:30` apparaît, `refresh()` annule l'un et programme l'autre.

### Limites d'Android à connaître

- **Permission** `POST_NOTIFICATIONS` (Android 13+) demandée à la première programmation, pas au démarrage.
- **Alarmes exactes** : `SCHEDULE_EXACT_ALARM` (Android 12+) ; l'écran Réglages > Notifications guide l'utilisateur vers l'autorisation si elle manque. Sans elle, Notifee retombe sur des alarmes inexactes (quelques minutes de décalage).
- **Redémarrage** : Notifee reprogramme ses déclencheurs au démarrage du téléphone ; `refresh()` sert de filet à l'ouverture suivante.
- **Économiseur de batterie** de certains fabricants (Xiaomi, Tecno, Infinix, Huawei…) : peut empêcher les alarmes. L'écran Réglages > Notifications propose le raccourci vers les réglages d'optimisation de la batterie et explique comment exclure DONNI.
- **Plafond** : Android limite le nombre d'alarmes par application ; DONNI ne programme que les 14 prochains jours et complète à chaque `refresh()`.
- **Heures calmes** : un rappel tombant dans `quietStart`–`quietEnd` est décalé à la fin de la plage (sauf rappels marqués prioritaires).

### Smart Reminder

Quand le déclencheur d'une tâche est passé et que son statut est encore `todo` ou `doing`, la notification propose quatre actions : Maintenant (+10 min), Ce soir (19:00, ou +2 h si déjà passé), Demain (même heure), Ignorer. L'action reprogramme la tâche via le même chemin que l'écran, jamais en contournant la base. Aucune décision n'est prise sans action de l'utilisateur.

## Niveau 2 : FCM (événements distants)

Pour ce qui n'existe que côté serveur : alerte de connexion depuis un nouvel appareil, changement de mot de passe, message silencieux `sync_available` qui déclenche une synchronisation sur les autres appareils. FCM ne remplace jamais le niveau 1. Sans `google-services.json` à la compilation et sans compte de service sur le serveur, ce niveau est simplement inactif et l'application fonctionne identiquement.

## Niveau 3 : WhatsApp (optionnel)

Rappels envoyés via l'API officielle WhatsApp Business Cloud, uniquement pour les rappels marqués `viaWhatsapp` et pour un utilisateur ayant activé `whatsappOptIn`. Désactivé par défaut. Voir `docs/whatsapp.md`.

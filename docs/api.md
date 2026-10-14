# API DONNI

Base : `/api/v1`. Corps et réponses en JSON UTF-8, champs en `camelCase`. Dates `YYYY-MM-DD`, instants ISO 8601 UTC (`2026-10-05T17:00:00Z`), heures locales `HH:mm`. Montants en FCFA, entiers.

Documentation interactive : `/swagger-ui.html` (désactivable avec `SWAGGER_ENABLED=false`).

## Erreurs

Toute erreur renvoie :

```json
{ "status": 422, "code": "validation_failed", "message": "Données invalides", "fields": { "phone": "Numéro invalide" } }
```

`fields` est absent hors validation. Codes utilisés : `validation_failed`, `invalid_credentials`, `phone_taken`, `unauthorized`, `token_expired`, `refresh_reused`, `forbidden`, `not_found`, `version_conflict`, `rate_limited`, `reset_channel_unavailable`, `invalid_reset_code`, `internal_error`.

## Authentification

JWT d'accès (15 min, HS256, claim `sub` = id utilisateur) et jeton de rafraîchissement opaque (30 jours, à usage unique, rotation). Le serveur ne stocke que le hash SHA-256 du jeton de rafraîchissement. Réutiliser un jeton déjà consommé révoque toute la famille de sessions (`refresh_reused`).

Les routes protégées attendent `Authorization: Bearer <accessToken>`.

| Route | Corps | Réponse |
| --- | --- | --- |
| `POST /auth/register` | `{ fullName, phone, password, deviceId? }` | `201` `AuthResponse` |
| `POST /auth/login` | `{ phone, password, deviceId? }` | `AuthResponse` |
| `POST /auth/refresh` | `{ refreshToken }` | `AuthResponse` |
| `POST /auth/logout` | `{ refreshToken }` | `204` |
| `POST /auth/password/change` | `{ currentPassword, newPassword }` (protégé) | `204`, révoque les autres sessions |
| `POST /auth/password/forgot` | `{ phone }` | `202` toujours (pas d'énumération de comptes) ; `503 reset_channel_unavailable` si WhatsApp n'est pas configuré |
| `POST /auth/password/reset` | `{ phone, code, newPassword }` | `204` |
| `DELETE /auth/account` | `{ password }` (protégé) | `204`, supprime le compte et toutes ses données |
| `GET /auth/me` | | `{ id, fullName, phone, createdAt }` |

```json
AuthResponse = {
  "accessToken": "...", "refreshToken": "...", "expiresIn": 900,
  "user": { "id": "uuid", "fullName": "Marc", "phone": "+237600000000" }
}
```

Règles : `phone` est normalisé en E.164 (défaut `+237` si le numéro commence par `6` et fait 9 chiffres) ; mot de passe 8 caractères minimum, 72 maximum ; `fullName` 2 à 80 caractères. Limitation de débit par IP et par numéro sur `/auth/*` (10 requêtes par minute).

## Ressources synchronisées

Chaque ressource est une table synchronisée (voir `docs/offline-sync.md`). Chemins :

`tasks`, `reminders`, `goals`, `goal-steps`, `habits`, `habit-logs`, `accounts`, `transactions`, `budgets`, `energy`, `contacts`, `contact-interactions`, `notes`, `skills`, `weekly-reviews`, `settings`.

| Route | Description |
| --- | --- |
| `GET /{resource}?updatedSince=<version>&limit=&offset=` | Liste des enregistrements non supprimés ; `updatedSince` filtre sur `version >` ; filtres supplémentaires listés plus bas |
| `GET /{resource}/{id}` | Un enregistrement |
| `POST /{resource}` | Création ; l'`id` peut être fourni par le client |
| `PUT /{resource}/{id}` | Mise à jour ; `baseVersion` obligatoire ; `409 version_conflict` (avec l'enregistrement serveur dans `server`) si la version ne correspond pas |
| `DELETE /{resource}/{id}?baseVersion=` | Suppression logique (tombstone) |

Représentation d'un enregistrement :

```json
{ "id": "uuid", "version": 42, "createdAt": "...", "updatedAt": "...", "deletedAt": null, "...champs": "..." }
```

Filtres : `tasks?day=YYYY-MM-DD`, `transactions?from=&to=&category=&q=`, `energy?day=`, `budgets?month=YYYY-MM`, `habit-logs?habitId=`, `goal-steps?goalId=`, `contact-interactions?contactId=`.

`settings` est un singleton par utilisateur : `GET /settings` renvoie l'enregistrement (créé avec les valeurs par défaut s'il n'existe pas), `PUT /settings` le met à jour.

## Synchronisation

`POST /sync` : voir `docs/offline-sync.md`.

## Tableau de bord

`GET /dashboard` : synthèse calculée côté serveur (utilisée par le résumé WhatsApp ; l'application mobile calcule la sienne localement).

```json
{
  "date": "2026-10-05",
  "tasks": { "planned": 4, "done": 1, "nextTask": { "id": "uuid", "title": "Deep work", "startTime": "09:00" } },
  "money": { "walletBalanceXof": 12500, "debtXof": -3200, "creditXof": 1000, "monthExpensesXof": 128500 },
  "goals": { "active": 2, "averageProgress": 30 },
  "energy": { "today": [ { "metric": "sleep", "value": 5.5, "target": 6 } ] },
  "network": { "overdueContacts": 1 }
}
```

## Appareils et notifications

| Route | Description |
| --- | --- |
| `PUT /devices` | `{ fcmToken, appVersion? }` : enregistre ou met à jour l'appareil |
| `DELETE /devices/{fcmToken}` | Supprime l'appareil |
| `GET /notifications?limit=&before=` | Historique des notifications distantes |
| `POST /notifications/{id}/read` | Marque comme lue |
| `GET /notifications/preferences` | `[ { channel, type, enabled } ]` |
| `PUT /notifications/preferences` | Remplace les préférences fournies |
| `POST /notifications/test` | Envoie une notification FCM de test à l'utilisateur ; `409` si aucun appareil enregistré, `503` si FCM n'est pas configuré |

Types FCM : `login_new_device`, `sync_available`, `account_security`, `test`.

## WhatsApp (optionnel)

| Route | Description |
| --- | --- |
| `POST /whatsapp/test` | Envoie le modèle `donni_test` au numéro de l'utilisateur (protégé) ; `503` si le module est désactivé |
| `GET /whatsapp/status` | `{ mode: "disabled" \| "mock" \| "live" }` |
| `GET /webhooks/whatsapp` | Vérification Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| `POST /webhooks/whatsapp` | Statuts de livraison ; signature `X-Hub-Signature-256` vérifiée avec `WHATSAPP_APP_SECRET` |
| `POST /internal/whatsapp/dispatch` | Envoie les rappels `via_whatsapp` échus ; protégé par l'en-tête `X-Dispatch-Token` (`DISPATCH_TOKEN`) ; réponse `{ sent, failed }` |

## Santé

`GET /actuator/health` (public, sans détails).

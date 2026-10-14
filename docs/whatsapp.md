# WhatsApp

WhatsApp est un canal facultatif et complémentaire. Les rappels personnels passent d'abord par les notifications locales du téléphone, qui ne dépendent d'aucun service tiers.

Seule l'API officielle WhatsApp Business Cloud (Meta) est utilisée. Aucune bibliothèque non officielle, aucun automate de navigateur.

## Modes

Variable `WHATSAPP_MODE` :

| Mode | Comportement |
| --- | --- |
| `disabled` (défaut) | Aucun envoi ; `GET /whatsapp/status` renvoie `disabled`, `POST /whatsapp/test` répond 503 |
| `mock` | Les messages sont enregistrés comme envoyés avec un identifiant `mock-…` ; aucun appel réseau. Utile en développement et en démonstration |
| `live` | Appels réels vers `graph.facebook.com` |

## Configuration du mode `live`

1. Créer une application Meta de type Business et y ajouter le produit WhatsApp.
2. Relever l'identifiant du numéro (`WHATSAPP_PHONE_NUMBER_ID`), l'identifiant du compte WhatsApp Business (`WHATSAPP_BUSINESS_ACCOUNT_ID`) et générer un jeton d'accès permanent d'utilisateur système (`WHATSAPP_ACCESS_TOKEN`).
3. Créer et faire approuver, en français (`fr`), les modèles de message ci-dessous. Hors fenêtre de 24 heures, WhatsApp n'accepte que des modèles approuvés.

   | Modèle | Paramètres du corps | Usage |
   | --- | --- | --- |
   | `donni_test` | aucun | `POST /whatsapp/test` |
   | `donni_rappel_tache` | 2 | Rappel de tâche |
   | `donni_rappel_objectif` | 1 | Rappel d'objectif |
   | `donni_rappel_contact` | 1 | Relance d'un contact |
   | `donni_rappel_routine` | 1 | Rappel d'habitude ou de routine |
   | `donni_code_reinitialisation` | 1 | Code de réinitialisation du mot de passe |
4. Enregistrer le webhook : URL `https://votre-serveur/api/v1/webhooks/whatsapp`, jeton de vérification identique à `WHATSAPP_VERIFY_TOKEN`. La signature `X-Hub-Signature-256` est vérifiée avec `WHATSAPP_APP_SECRET`.
5. Positionner `WHATSAPP_MODE=live` et redémarrer.

Les conditions de tarification et de modèles de Meta évoluent : les vérifier dans la documentation officielle avant le déploiement.

## Réinitialisation du mot de passe

Le code de réinitialisation est envoyé par WhatsApp avec le modèle `donni_code_reinitialisation`. Sans WhatsApp configuré, l'API répond `reset_channel_unavailable` et l'application l'indique à l'utilisateur. Le code n'est jamais conservé en clair, ni dans `whatsapp_messages`.

## Consentement

Un rappel n'est envoyé que si l'utilisateur a activé « Recevoir aussi mes rappels sur WhatsApp » dans Réglages > Notifications. Le réglage est synchronisé (`user_settings.whatsapp_opt_in`) et relu au moment de l'envoi. Un compte désactivé ou supprimé n'est jamais contacté.

## Envoi des rappels

`POST /api/v1/internal/whatsapp/dispatch` sélectionne les rappels `via_whatsapp` échus, non envoyés, datant de moins de 24 heures, les réserve (`whatsapp_sent_at`) puis les envoie. En cas d'échec, la réservation est levée pour une nouvelle tentative. L'appel exige l'en-tête `X-Dispatch-Token` égal à `DISPATCH_TOKEN`.

Le serveur n'a pas de planificateur interne : quelque chose doit appeler ce point d'entrée.

- **GitHub Actions** : `.github/workflows/whatsapp-dispatch.yml` l'appelle toutes les 10 minutes si la variable de dépôt `DONNI_DISPATCH_URL` est définie (par exemple `https://donni-api.example.com/api/v1`) et le secret `DISPATCH_TOKEN` renseigné. GitHub ne garantit pas l'heure exacte des déclenchements planifiés ; un décalage de quelques minutes est normal.
- **Tout autre planificateur** : `cron-job.org`, `cron` d'un serveur, etc.

Sans appelant, aucun message WhatsApp n'est envoyé, mais rien d'autre n'est affecté.

## Statuts de livraison

Le webhook met à jour `whatsapp_messages.status` (sent, delivered, read, failed). Les événements sans signature valide sont refusés.

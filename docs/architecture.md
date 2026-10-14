# Architecture

## Vue d'ensemble

```
Téléphone Android                              Serveur (facultatif)
-----------------                              --------------------
Écrans React Native                            Spring Boot 3 / Java 21
   |                                              |
Repository + requêtes  <--- POST /sync --->   SyncService (EntitySpec)
   |                                              |
SQLite (op-sqlite)                             PostgreSQL 16 (Flyway)
   |                                              |
ReminderScheduler --> Notifee --> AlarmManager    FCM (firebase-admin)
                                                  WhatsApp Cloud API
```

Le téléphone est la source de vérité de l'expérience : tout s'écrit d'abord en local, puis se synchronise quand une connexion est disponible.

## Application mobile

Chemin : `mobile/src`.

| Dossier | Rôle |
| --- | --- |
| `domain/` | Logique pure, sans dépendance native : dates, argent, énergie, réseau, direction, habitudes, récurrence, bilan, recherche, dérivation des rappels. Entièrement testée. |
| `db/` | `DataStore` (SQLite derrière une interface), `Repository`, requêtes, `useLiveQuery`, bus de changements, migrations. |
| `sync/` | Moteur de synchronisation : lots, application des réponses, conflits, retard exponentiel, état affiché. |
| `api/` | Client HTTP, rafraîchissement du jeton, erreurs en français, stockage des jetons dans le Keystore. |
| `auth/` | Session : compte, mode sans compte, changement de compte, suppression. |
| `notifications/` | `ReminderScheduler`, port Notifee, actions du rappel intelligent, FCM. |
| `services/` | Effets de bord après écriture : régénération des rappels, seuils de budget, déclenchement de la synchronisation. |
| `screens/`, `components/`, `navigation/`, `theme/` | Interface fidèle aux maquettes. |
| `runtime.ts` | Assemblage unique, partagé par l'interface et les gestionnaires d'arrière-plan. |

### Flux d'écriture

1. Un écran appelle le `Repository` (par exemple `repo.tables.tasks.update`).
2. La ligne est écrite avec `dirty = 1` et une séquence locale ; le bus de changements notifie.
3. Les `useLiveQuery` concernées se rechargent ; `startEffects` recalcule les rappels dérivés, évalue les budgets et planifie une synchronisation.
4. Les alarmes Android sont réconciliées par `ReminderScheduler.refresh()`.

### Séparation testable

Tout ce qui touche à React Native est isolé derrière des interfaces : `DataStore` (SQLite), `NotificationPort` (Notifee), `FetchLike` (réseau). Les tests exécutent la vraie logique avec des doublures : SQLite en mémoire, port de notifications factice.

## Serveur

Chemin : `backend/src/main/java/com/donni/api`.

| Paquet | Rôle |
| --- | --- |
| `auth`, `security` | Inscription par numéro de téléphone, JWT d'accès courts, jetons de rafraîchissement à usage unique avec détection de réutilisation, limitation de débit. |
| `sync` | Protocole de synchronisation et registre générique d'entités (`EntitySpecs`) ; une description par table plutôt que seize entités JPA. |
| `resources` | Lecture et écriture REST des données synchronisées. |
| `dashboard` | Agrégats pour le tableau de bord. |
| `devices`, `notifications` | Jetons FCM et envoi de notifications distantes. |
| `whatsapp` | Client Cloud API (réel ou simulé), webhook signé, envoi des rappels. |
| `demo` | Jeu de données de démonstration (profil `demo`). |

## Décisions

- **UUID générés par le client** : permet de créer des données hors connexion sans aller-retour.
- **Version par enregistrement** (`sync_version_seq`) : sert à la fois de curseur de synchronisation et de détection de conflit.
- **Suppression logique** (pierres tombales) : une suppression se synchronise comme une modification.
- **Pas de clés étrangères entre tables synchronisées** : un lot peut contenir l'enfant avant le parent.
- **Table `reminders` locale comme source de vérité des alarmes** : la réconciliation avec Android est idempotente.
- **FCM inerte sans `google-services.json`** : l'application compile et fonctionne sans Firebase.

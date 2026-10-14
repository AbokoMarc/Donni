# Base de données

PostgreSQL 16, schéma géré par Flyway (`backend/src/main/resources/db/migration`). Le serveur démarre avec `ddl-auto: validate` : le schéma n'est jamais modifié par Hibernate.

Le téléphone possède son propre schéma SQLite (`mobile/src/db/migrations.ts`), calqué sur les tables synchronisées avec des colonnes locales en plus (`dirty`, `local_seq`).

## Comptes et sessions

| Table | Contenu |
| --- | --- |
| `users` | Compte : nom, téléphone unique, hachage du mot de passe, statut |
| `refresh_tokens` | Jetons de rafraîchissement hachés, regroupés par famille ; `used_at` détecte la réutilisation |
| `password_resets` | Codes de réinitialisation hachés, tentatives limitées |
| `devices` | Jetons FCM par utilisateur |
| `notification_preferences` | Préférences par canal et type |
| `notifications` | Historique des notifications distantes |
| `whatsapp_messages` | Journal des messages WhatsApp et de leur statut de livraison |

## Tables synchronisées

Toutes portent `id` (UUID du client), `user_id`, `version`, `created_at`, `updated_at`, `deleted_at`. Index `(user_id, version)` pour la lecture incrémentale.

| Table | Domaine |
| --- | --- |
| `tasks` | Temps : créneaux et tâches, récurrence, rappel avant |
| `reminders` | Rappels programmés (sert aussi à l'envoi WhatsApp) |
| `goals`, `goal_steps` | Direction : objectifs et étapes |
| `habits`, `habit_logs` | Habitudes et validations |
| `accounts`, `transactions`, `budgets` | Argent : portefeuilles, dettes, crédits, mouvements, plafonds mensuels |
| `energy_logs` | Énergie : sommeil, humeur, sport, eau, échelles |
| `contacts`, `contact_interactions` | Réseau |
| `skills` | Compétences |
| `notes` | Notes, éventuellement rattachées à un objectif |
| `weekly_reviews` | Bilans hebdomadaires enregistrés |
| `user_settings` | Mode Focus, heures calmes, résumé du matin, WhatsApp |

Montants en francs CFA entiers (`amount_xof`) : dépenses négatives, entrées positives.

## Conflits

Les conflits ne sont pas stockés sur le serveur : il renvoie l'état courant de l'enregistrement et le client conserve le conflit dans `sync_conflicts` (SQLite) jusqu'à ce que l'utilisateur choisisse. Voir [offline-sync.md](offline-sync.md).

## Sauvegarde

```sh
sh admin/backup.sh                       # docker compose
DATABASE_URL_PG=postgresql://... sh admin/backup.sh
sh admin/restore.sh backups/donni-AAAAMMJJ-HHMMSS.sql.gz   # base vide
```

Les hébergeurs gratuits n'offrent généralement pas de sauvegarde : planifier `admin/backup.sh` soi-même. Les données vivant aussi sur le téléphone, une base perdue se reconstitue par la première synchronisation.

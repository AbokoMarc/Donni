# Hors connexion et synchronisation

DONNI lit et écrit d'abord dans la base SQLite du téléphone. Le réseau n'est jamais nécessaire pour utiliser l'application ; la synchronisation rattrape l'écart quand une connexion et une session valide existent.

## Principes

- Les identifiants sont des UUID v4 produits par le client.
- Chaque enregistrement porte `version` : numéro attribué par le serveur à chaque modification, tiré d'une séquence unique (`sync_version_seq`). `0` signifie « jamais envoyé ».
- Les suppressions sont logiques (`deletedAt`). Le serveur conserve les tombstones ; le client purge localement les siens une fois la suppression acquittée.
- Le serveur ne remplace jamais silencieusement une donnée : si la version de base du client n'est plus celle du serveur, la modification est refusée et renvoyée comme conflit.
- Les enregistrements sont indépendants : aucune clé étrangère entre tables synchronisées, le client peut pousser un enfant avant son parent.

## Protocole : `POST /api/v1/sync`

Requête :

```json
{
  "cursor": 120,
  "deviceId": "uuid",
  "changes": [
    { "entity": "tasks", "id": "uuid", "baseVersion": 0, "deleted": false, "data": { "title": "Sport", "day": "2026-10-05" } },
    { "entity": "goals", "id": "uuid", "baseVersion": 37, "deleted": true, "data": {} }
  ]
}
```

- `cursor` : plus grande `version` déjà reçue par ce client (0 au premier échange).
- `changes` : au plus 200 modifications locales non acquittées, dans l'ordre de leur création. `data` contient tous les champs métier de l'enregistrement (pas de patch partiel) ; il est ignoré pour une suppression.

Réponse :

```json
{
  "cursor": 133,
  "hasMore": false,
  "applied":   [ { "entity": "tasks", "id": "uuid", "version": 131 } ],
  "conflicts": [ { "entity": "goals", "id": "uuid", "server": { "version": 140, "deleted": false, "data": { } } } ],
  "changes":   [ { "entity": "contacts", "id": "uuid", "version": 125, "deleted": false, "data": { } } ]
}
```

- `applied` : modifications acceptées avec leur nouvelle `version`.
- `conflicts` : modifications refusées, avec l'état serveur courant.
- `changes` : enregistrements modifiés côté serveur après `cursor` (sans ceux qui viennent d'être appliqués par cette requête), triés par `version`, 200 au plus. Si `hasMore` vaut `true`, le client rappelle `/sync` avec le nouveau `cursor` et sans modification.
- `cursor` : plus grande `version` couverte par la réponse ; le client ne le persiste qu'après avoir écrit localement tout ce que la réponse contient.

### Règles côté serveur

Une transaction par requête, précédée d'un verrou consultatif par utilisateur (`pg_advisory_xact_lock`), de sorte que l'ordre des versions correspond à l'ordre de validation. Pour chaque modification :

1. L'enregistrement n'existe pas : insertion si `baseVersion` vaut 0, sinon insertion aussi (le client a reçu l'enregistrement d'un autre appareil puis l'a vu purgé), la `version` est attribuée.
2. L'enregistrement existe et `version == baseVersion` : mise à jour, nouvelle `version`, `updatedAt = now()`.
3. L'enregistrement existe et `version != baseVersion` :
   - si le contenu envoyé est identique à l'état stocké (nouvelle tentative après une réponse perdue), la modification est acquittée sans changement ;
   - sinon, c'est un conflit.
4. L'enregistrement appartient à un autre utilisateur : refus `403`, jamais divulgué.
5. Entité inconnue ou champ invalide : toute la requête est refusée en `422`, rien n'est écrit.

### Règles côté client

- Chaque ligne locale a `dirty` (0 ou 1). Toute écriture utilisateur met `dirty = 1` et laisse `version` inchangée (c'est la version de base).
- Envoi : lignes `dirty = 1`, par lots de 200, dans l'ordre de `local_seq`.
- `applied` : `version` mise à jour, `dirty = 0` sauf si la ligne a été modifiée entre-temps (comparer `local_seq`).
- `changes` : appliqué sauf si la ligne locale est `dirty` (dans ce cas le serveur a une version plus récente d'une ligne que l'utilisateur a aussi modifiée : conflit enregistré dans `sync_conflicts`).
- `conflicts` : stockés dans `sync_conflicts` (entité, id, version locale en JSON, version serveur en JSON). L'écran Réglages > Synchronisation les présente un par un :
  - **Garder ma version** : la ligne locale reprend `version` = version serveur, reste `dirty`, sera renvoyée et acceptée.
  - **Garder la version du serveur** : la ligne locale est remplacée par l'état serveur, `dirty = 0`.
- Déclencheurs : démarrage, retour au premier plan, retour de la connexion (NetInfo), 5 secondes après une écriture locale (anti-rebond), message FCM `sync_available`, et action manuelle.
- État affiché discrètement : « Hors connexion », « Synchronisation… », « Synchronisé », « Conflits à résoudre (n) ».
- En cas d'échec réseau : nouvelle tentative avec attente exponentielle (5 s, 10 s, 20 s, plafonnée à 5 min). Une réponse `401` déclenche un `refresh` ; si celui-ci échoue, la session est marquée expirée, l'application reste utilisable en local et propose la reconnexion.
- Les rappels locaux ne dépendent jamais de ce mécanisme (voir `docs/notifications.md`).

## Catalogue des entités

Tous les enregistrements ont en plus : `id`, `version`, `createdAt`, `updatedAt`, `deletedAt`. Le nom d'entité du protocole est celui de la colonne « Entité » ; la table SQL porte le même nom en `snake_case`, sauf `energy` (table `energy_logs`). Les colonnes SQL sont les champs en `snake_case`.

| Entité (protocole) | Table | Champs métier |
| --- | --- | --- |
| `tasks` | `tasks` | `title` string requis, `notes?`, `kind` task\|routine\|focus\|break\|event, `day` date, `startTime?` HH:mm, `endTime?` HH:mm, `durationMin?` int, `priority` 0..2, `status` todo\|doing\|done\|skipped, `position` int, `recurrence?` string (`daily`, `weekdays`, `weekly:1,3,5` avec 0 = dimanche), `goalId?` uuid, `remindBeforeMin?` int |
| `reminders` | `reminders` | `targetType` task\|goal\|habit\|contact\|budget\|custom, `targetId?` uuid, `label` string, `fireAt` instant, `status` scheduled\|fired\|dismissed\|snoozed, `viaWhatsapp` bool, `whatsappSentAt?` instant |
| `goals` | `goals` | `title`, `status` todo\|doing\|done, `dueDate?`, `notes?`, `progressManual?` 0..100 |
| `goalSteps` | `goal_steps` | `goalId`, `title`, `done` bool, `position` int |
| `habits` | `habits` | `title`, `cadence` daily\|weekly, `targetPerPeriod` int ≥ 1, `remindAt?` HH:mm, `goalId?`, `archived` bool |
| `habitLogs` | `habit_logs` | `habitId`, `day`, `count` int ≥ 0 |
| `accounts` | `accounts` | `label`, `kind` wallet\|debt\|credit, `provider?`, `amountXof` int (solde d'ouverture pour un portefeuille ; montant signé pour dette et crédit), `counterparty?`, `dueDate?`, `note?` |
| `transactions` | `transactions` | `accountId?`, `day`, `label`, `amountXof` int signé, `category` alimentation\|transport\|logement\|sante\|etudes\|travail\|loisirs\|famille\|abonnements\|revenus\|autres, `note?` |
| `budgets` | `budgets` | `month` YYYY-MM, `category?` (absent = budget global du mois), `limitXof` int > 0, `alertedLevel` 0\|80\|100 |
| `energy` | `energy_logs` | `day`, `metric` string (`sleep`, `mood`, `sport`, `water`, `focus`, `stress`, `recovery` ou clé libre), `label`, `value?` nombre, `valueText?`, `target?` nombre, `unit?` |
| `contacts` | `contacts` | `name`, `relation` famille\|ami\|mentor\|collegue\|client\|partenaire\|autre, `phone?`, `note?`, `frequencyKind` none\|weekly\|biweekly\|monthly, `frequencyDay?` (0..6 pour weekly/biweekly, 1..28 pour monthly), `frequencyTime?` HH:mm, `lastContactAt?`, `nextContactAt?` |
| `contactInteractions` | `contact_interactions` | `contactId`, `at` instant, `channel` call\|whatsapp\|meeting\|other, `note?` |
| `skills` | `skills` | `name`, `level` 0..100, `monthlyTargetXof?`, `note?` |
| `notes` | `notes` | `title`, `body`, `targetType?`, `targetId?` |
| `weeklyReviews` | `weekly_reviews` | `weekStart` date (lundi), `payload` objet JSON libre |
| `settings` | `user_settings` | `focusMode` bool, `whatsappOptIn` bool, `language` string, `quietStart?` HH:mm, `quietEnd?` HH:mm, `dailyBriefAt?` HH:mm |

Dans le protocole `/sync`, le champ `entity` utilise ces noms en `camelCase` (`goalSteps`, `habitLogs`, `contactInteractions`, `weeklyReviews`). Les chemins REST utilisent les noms en `kebab-case` (`goal-steps`, `habit-logs`, …) définis dans `docs/api.md`.

Valeurs d'énumération inconnues, champs requis manquants, `limitXof <= 0`, `level` hors 0..100, heures qui ne suivent pas `HH:mm` : refus de validation.

## Calculs faits côté client

Pas stockés, toujours recalculés depuis les enregistrements :

- solde d'un portefeuille = `amountXof` d'ouverture + somme des `transactions.amountXof` du compte ;
- progression d'un objectif = étapes terminées / étapes, ou `progressManual` s'il n'y a pas d'étape ;
- série d'une habitude, progression du jour, temps disponible, bilan hebdomadaire.

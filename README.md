# DONNI

Ton temps. Ton argent. Ta direction.

DONNI est une application Android personnelle qui rassemble six domaines de vie : Temps, Argent, Énergie, Réseau, Direction et Compétences. Elle fonctionne d'abord sur le téléphone : les données sont stockées localement (SQLite) et les rappels sont programmés comme alarmes Android. Un serveur facultatif ajoute la synchronisation entre appareils, les notifications à distance et, en option, les rappels WhatsApp.

## Ce qui est dans le dépôt

| Dossier | Contenu |
| --- | --- |
| `mobile/` | Application React Native (CLI, TypeScript), sans Expo ni WebView |
| `backend/` | API Spring Boot 3, Java 21, PostgreSQL, Spring Security + JWT, Flyway, OpenAPI |
| `admin/` | Scripts : sauvegarde et restauration de la base, génération de secrets et de keystore |
| `docs/` | Documentation technique et maquettes de référence (`docs/design/`) |
| `.github/workflows/` | Compilation de l'application (APK, AAB), tests du serveur, envoi WhatsApp facultatif |

## Principes

- **Local d'abord** : chaque écran fonctionne sans connexion. Les données vivent dans SQLite sur le téléphone.
- **Rappels locaux** : une tâche à 18 h déclenche une notification Android programmée sur l'appareil, même si le serveur est arrêté. Modifier 18:00 en 19:30 annule l'ancienne alarme et en programme une nouvelle. Voir [docs/notifications.md](docs/notifications.md).
- **Cloud en complément** : synchronisation, FCM pour les événements distants, WhatsApp via l'API officielle Cloud uniquement. Voir [docs/offline-sync.md](docs/offline-sync.md).
- **Aucun service payant obligatoire**, aucune tâche planifiée côté serveur pour les rappels personnels.
- **Aucun secret dans l'APK** : le téléphone ne connaît que l'adresse de l'API et ses propres jetons, stockés dans le Keystore Android.
- **Conflits jamais écrasés en silence** : une modification concurrente est présentée à l'utilisateur, qui choisit quelle version garder.

## Démarrage rapide

### Serveur

```sh
cp .env.example .env
sh admin/generate-secrets.sh        # copier les valeurs dans .env
docker compose up --build
```

L'API écoute sur `http://localhost:8080/api/v1`, la documentation OpenAPI sur `/swagger-ui.html`, la santé sur `/actuator/health`.

Pour charger le compte de démonstration (utilisateur Marc), renseigner dans `.env` :

```
SPRING_PROFILES_ACTIVE=demo
DEMO_PASSWORD=un-mot-de-passe-d-au-moins-8-caracteres
```

Le compte de démonstration utilise le numéro `+237600000000`. Voir [docs/deployment.md](docs/deployment.md).

### Application

```sh
cd mobile
npm install
npm run android          # téléphone ou émulateur connecté
```

Pour obtenir des APK sans Android Studio, voir [docs/android-build.md](docs/android-build.md). Les workflows GitHub produisent `DONNI-debug.apk`, `DONNI-release.apk` et `DONNI-release.aab`.

Au premier lancement, l'écran de bienvenue permet de créer un compte, de se connecter ou de continuer sans compte. L'adresse du serveur se règle dans Réglages > Serveur.

### Tests

```sh
cd mobile && npm test            # logique métier, base locale, synchronisation, rappels
cd backend && mvn verify         # tests unitaires et d'intégration (Docker requis pour Testcontainers)
```

## Documentation

- [Architecture](docs/architecture.md)
- [Base de données](docs/database.md)
- [API](docs/api.md)
- [Hors connexion et synchronisation](docs/offline-sync.md)
- [Notifications](docs/notifications.md)
- [WhatsApp](docs/whatsapp.md)
- [Déploiement gratuit](docs/deployment.md)
- [Compilation Android](docs/android-build.md)
- [Design](docs/design.md)

## Limites connues

- Le statut « terminé » d'une tâche récurrente s'applique à la tâche, pas à chaque occurrence.
- Android limite une notification à trois boutons d'action : les rappels intelligents proposent « Maintenant », « Ce soir » et « Demain » ; « Ignorer » correspond au balayage de la notification.
- Le projet cible Android uniquement.

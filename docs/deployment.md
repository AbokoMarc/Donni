# Déploiement

L'application fonctionne sans serveur. Le serveur n'est nécessaire que pour synchroniser plusieurs appareils, recevoir des notifications distantes et, en option, des rappels WhatsApp. Il se déploie sous forme d'une image Docker et d'une base PostgreSQL.

## Variables d'environnement

Voir `.env.example`. Les indispensables :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | `jdbc:postgresql://hôte:5432/base` ou `postgres://utilisateur:motdepasse@hôte:5432/base` (convertie automatiquement) |
| `DATABASE_USER`, `DATABASE_PASSWORD` | Identifiants si l'URL n'en contient pas |
| `JWT_SECRET` | Au moins 32 octets aléatoires |
| `JWT_REFRESH_PEPPER` | Secret aléatoire distinct |
| `PORT` | Port d'écoute (la plupart des hébergeurs l'injectent) |

Générer les secrets : `sh admin/generate-secrets.sh`. Ne jamais les placer dans l'application mobile ni dans le dépôt.

## En local ou sur un VPS

```sh
cp .env.example .env
sh admin/generate-secrets.sh        # reporter dans .env
docker compose up -d --build
```

Placer un proxy inverse avec HTTPS (Caddy, Nginx) devant le port 8080. Android bloque le HTTP en clair vers les serveurs distants : l'application doit pointer vers une adresse `https://`.

## Options gratuites

Les offres gratuites changent souvent. Les points suivants ont été relevés en octobre 2026 ; les vérifier avant de s'engager.

| Brique | Option | Limites relevées |
| --- | --- | --- |
| API | [Render](https://render.com/docs/free), service web gratuit | Mise en veille après 15 minutes sans trafic, réveil d'environ une minute, 750 heures par mois, système de fichiers non persistant |
| Base | [Neon](https://neon.com/pricing), plan gratuit | 1 Go par projet, 100 heures de calcul par projet, suspension automatique après 5 minutes d'inactivité, sans carte bancaire |
| Base | Postgres gratuit de Render | 1 Go, expire 30 jours après création (14 jours de grâce), sans sauvegarde : déconseillé |
| API + base | VM Always Free d'Oracle Cloud | Allocation Ampere A1 réduite à 2 OCPU et 12 Go selon la [documentation Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) ; installer Docker et utiliser `docker-compose.yml` |

Recommandation pour démarrer sans frais : API sur Render, base sur Neon (`DATABASE_URL` fournie par Neon, avec `?sslmode=require`).

### Effets de la mise en veille

La mise en veille de l'API gratuite ne casse rien :

- Les rappels sont locaux et sonnent sans serveur.
- Une synchronisation tombant pendant le réveil échoue, puis est retentée automatiquement avec un délai croissant.
- Seuls les rappels WhatsApp et les notifications FCM dépendent d'un serveur éveillé.

### Render, pas à pas

Le fichier `render.yaml` à la racine décrit le service (Blueprint). Il active le profil `demo` pour tester avec les données de Marc ; retirer `SPRING_PROFILES_ACTIVE` et `DEMO_PASSWORD` en usage réel.

1. Créer un service web depuis ce dépôt, racine `backend`, environnement Docker (ou utiliser le Blueprint).
2. Renseigner les variables du tableau ci-dessus et `CORS_ALLOWED_ORIGINS` si une interface web est ajoutée.
3. Vérifier `https://<service>.onrender.com/actuator/health`.
4. Dans l'application : Réglages > Serveur, saisir `https://<service>.onrender.com/api/v1`, tester la connexion.

## Firebase Cloud Messaging (facultatif)

1. Créer un projet Firebase et ajouter une application Android d'identifiant `com.donni`.
2. Télécharger `google-services.json` : le placer dans `mobile/android/app/` pour un build local, ou dans le secret GitHub `GOOGLE_SERVICES_JSON` pour le CI.
3. Créer un compte de service et renseigner `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` côté serveur.

Sans ces éléments, FCM reste inactif et tout le reste fonctionne.

## Données de démonstration

`SPRING_PROFILES_ACTIVE=demo` et `DEMO_PASSWORD` créent un compte pour Marc (`+237600000000`) avec des données réalistes, une seule fois. À ne pas activer en production.

## Exploitation

- Sauvegardes : `admin/backup.sh`, à planifier (voir [database.md](database.md)).
- Santé : `GET /actuator/health`.
- Documentation OpenAPI : `/swagger-ui.html` ; mettre `SWAGGER_ENABLED=false` si l'API est publique.
- Mises à jour : les migrations Flyway s'appliquent au démarrage.

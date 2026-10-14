# Compilation Android

Aucun Android Studio n'est nécessaire : Gradle en ligne de commande suffit.

## Prérequis

- Node.js 18 ou plus
- JDK 17
- SDK Android (outils en ligne de commande) avec `ANDROID_HOME` défini, plateformes et build-tools correspondant à `mobile/android/build.gradle`

## Compiler

```sh
cd mobile
npm install
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease      # app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease        # app/build/outputs/bundle/release/app-release.aab
```

Installer sur un téléphone connecté : `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

## Signature de publication

Sans configuration, `assembleRelease` signe avec la clé de débogage : l'APK est installable pour des tests, pas publiable.

Pour une vraie signature :

```sh
sh admin/generate-keystore.sh donni-release.keystore
export DONNI_KEYSTORE_PATH=$PWD/donni-release.keystore
export DONNI_KEYSTORE_PASSWORD=...
export DONNI_KEY_ALIAS=donni
export DONNI_KEY_PASSWORD=...
cd mobile/android && ./gradlew assembleRelease bundleRelease
```

Conserver le keystore et ses mots de passe hors du dépôt et en lieu sûr : les perdre interdit toute mise à jour de l'application déjà publiée. Les fichiers `*.keystore` sont ignorés par Git, sauf la clé de débogage.

## GitHub Actions

Le workflow `.github/workflows/mobile.yml` exécute le contrôle de types, le lint et les tests, puis produit trois artefacts : `DONNI-debug.apk`, `DONNI-release.apk` et `DONNI-release.aab`.

Secrets facultatifs du dépôt :

| Secret | Contenu |
| --- | --- |
| `DONNI_KEYSTORE_BASE64` | Sortie base64 de `admin/generate-keystore.sh` |
| `DONNI_KEYSTORE_PASSWORD`, `DONNI_KEY_ALIAS`, `DONNI_KEY_PASSWORD` | Paramètres du keystore |
| `GOOGLE_SERVICES_JSON` | Contenu de `google-services.json`, pour activer FCM |

Le code de version est le numéro d'exécution du workflow (`donniVersionCode`).

## Réseau local en développement

L'APK de débogage autorise le HTTP en clair, ce qui permet de viser un serveur sur le réseau local (par exemple `http://192.168.1.20:8080/api/v1`). L'APK de publication n'accepte que le HTTPS.

## Adresse du serveur

L'APK ne contient aucun secret. L'adresse de l'API se règle dans Réglages > Serveur, ou à la compilation dans `mobile/src/config.ts` (`DEFAULT_API_URL`).

## Polices

L'affichage utilise Inter et une police à empattements pour le titre « DONNI ». Pour la remplacer, déposer le fichier TTF sous le nom `DonniDisplay-Regular.ttf` dans `mobile/assets/fonts/` et `mobile/android/app/src/main/assets/fonts/`.

## Dépannage

- `SDK location not found` : définir `ANDROID_HOME` ou créer `mobile/android/local.properties` avec `sdk.dir=...`.
- Échec de résolution Gradle : vérifier l'accès à `services.gradle.org`, `dl.google.com` et Maven Central.
- Rappels en retard sur certains téléphones : autoriser les alarmes exactes et retirer la restriction de batterie, voir Réglages > Notifications.

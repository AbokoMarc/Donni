#!/bin/sh
# Crée le keystore de publication Android et affiche la valeur base64 à stocker dans GitHub Actions.
# Usage : admin/generate-keystore.sh [fichier]
# Conservez le fichier et ses mots de passe en lieu sûr : sans eux, aucune mise à jour du même
# identifiant d'application ne pourra être publiée.
set -eu

file="${1:-donni-release.keystore}"
if [ -e "$file" ]; then
  echo "$file existe déjà" >&2
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$file" \
  -alias donni \
  -keyalg RSA -keysize 4096 -validity 10000

echo
echo "DONNI_KEYSTORE_BASE64 :"
base64 -w0 "$file" 2>/dev/null || base64 "$file" | tr -d '\n'
echo

#!/bin/sh
# Affiche des secrets aléatoires à copier dans .env ou dans les variables de l'hébergeur.
set -eu

for name in JWT_SECRET JWT_REFRESH_PEPPER DISPATCH_TOKEN POSTGRES_PASSWORD; do
  printf '%s=%s\n' "$name" "$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)"
done

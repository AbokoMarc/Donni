#!/bin/sh
# Sauvegarde compressée de la base. Usage : admin/backup.sh [dossier]
# Variables : DATABASE_URL_PG (postgresql://user:motdepasse@hôte:5432/base) ou, avec docker-compose, rien.
set -eu

dir="${1:-backups}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dir"
file="$dir/donni-$stamp.sql.gz"

if [ -n "${DATABASE_URL_PG:-}" ]; then
  pg_dump --no-owner --no-privileges "$DATABASE_URL_PG" | gzip > "$file"
else
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner --no-privileges "$POSTGRES_DB"' | gzip > "$file"
fi

echo "$file"

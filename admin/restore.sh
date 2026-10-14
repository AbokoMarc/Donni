#!/bin/sh
# Restaure une sauvegarde dans une base VIDE. Usage : admin/restore.sh fichier.sql.gz
set -eu

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage : admin/restore.sh fichier.sql.gz" >&2
  exit 1
fi

if [ -n "${DATABASE_URL_PG:-}" ]; then
  gunzip -c "$1" | psql -v ON_ERROR_STOP=1 "$DATABASE_URL_PG"
else
  gunzip -c "$1" | docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
fi

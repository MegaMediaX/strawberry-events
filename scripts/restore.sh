#!/usr/bin/env bash
# Restore from a backup directory produced by backup.sh.
# Usage: scripts/restore.sh ./backups/<stamp>
#
# DESTRUCTIVE: replaces the current app DB, pretix DB, and data volumes with
# the backup's contents. Each database schema is dropped and recreated first so
# the restore works into a non-empty database (a plain pipe into psql would
# collide with existing tables).
set -euo pipefail

SRC="${1:?Usage: restore.sh <backup-dir>}"

for f in app-db.sql.gz pretix-db.sql.gz pretix-data.tar.gz; do
  [ -f "${SRC}/${f}" ] || { echo "Missing ${SRC}/${f} — not a backup.sh directory?"; exit 1; }
done

echo "This OVERWRITES the current databases and volumes with '${SRC}'."
read -r -p "Type 'restore' to continue: " CONFIRM
[ "${CONFIRM}" = "restore" ] || { echo "Aborted."; exit 1; }

echo "Restoring app database..."
docker compose exec -T postgres-app psql -U "${POSTGRES_APP_USER:-app}" "${POSTGRES_APP_DB:-strawberry_platform}" \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
gunzip -c "${SRC}/app-db.sql.gz" | docker compose exec -T postgres-app psql -U "${POSTGRES_APP_USER:-app}" "${POSTGRES_APP_DB:-strawberry_platform}"

echo "Restoring pretix database..."
docker compose exec -T postgres-pretix psql -U "${POSTGRES_PRETIX_USER:-pretix}" "${POSTGRES_PRETIX_DB:-pretix}" \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
gunzip -c "${SRC}/pretix-db.sql.gz" | docker compose exec -T postgres-pretix psql -U "${POSTGRES_PRETIX_USER:-pretix}" "${POSTGRES_PRETIX_DB:-pretix}"

echo "Restoring pretix data volume..."
docker run --rm -v strawberry-events_pretix-data:/data -v "$(pwd)/${SRC}":/backup alpine \
  sh -c "rm -rf /data/* && cd /data && tar xzf /backup/pretix-data.tar.gz"

if [ -f "${SRC}/uploads-data.tar.gz" ]; then
  echo "Restoring uploaded media volume (event covers)..."
  docker run --rm -v strawberry-events_uploads-data:/data -v "$(pwd)/${SRC}":/backup alpine \
    sh -c "rm -rf /data/* && cd /data && tar xzf /backup/uploads-data.tar.gz"
else
  echo "No uploads-data.tar.gz in backup (pre-uploads backup) — skipping media restore."
fi

echo "Restore complete."

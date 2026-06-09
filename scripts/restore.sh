#!/usr/bin/env bash
# Restore from a backup directory produced by backup.sh.
# Usage: scripts/restore.sh ./backups/<stamp>
set -euo pipefail

SRC="${1:?Usage: restore.sh <backup-dir>}"

echo "Restoring app database..."
gunzip -c "${SRC}/app-db.sql.gz" | docker compose exec -T postgres-app psql -U "${POSTGRES_APP_USER:-app}" "${POSTGRES_APP_DB:-strawberry_platform}"

echo "Restoring pretix database..."
gunzip -c "${SRC}/pretix-db.sql.gz" | docker compose exec -T postgres-pretix psql -U "${POSTGRES_PRETIX_USER:-pretix}" "${POSTGRES_PRETIX_DB:-pretix}"

echo "Restoring pretix data volume..."
docker run --rm -v strawberry-events_pretix-data:/data -v "$(pwd)/${SRC}":/backup alpine \
  sh -c "cd /data && tar xzf /backup/pretix-data.tar.gz"

echo "Restore complete."

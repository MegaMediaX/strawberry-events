#!/usr/bin/env bash
# Weekly backup: custom app DB, pretix DB, and pretix data volume.
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR:-./backups}/${STAMP}"
mkdir -p "${OUT}"

echo "Backing up app database..."
docker compose exec -T postgres-app pg_dump -U "${POSTGRES_APP_USER:-app}" "${POSTGRES_APP_DB:-strawberry_platform}" | gzip > "${OUT}/app-db.sql.gz"

echo "Backing up pretix database..."
docker compose exec -T postgres-pretix pg_dump -U "${POSTGRES_PRETIX_USER:-pretix}" "${POSTGRES_PRETIX_DB:-pretix}" | gzip > "${OUT}/pretix-db.sql.gz"

echo "Backing up pretix data volume..."
docker run --rm -v strawberry-events_pretix-data:/data -v "$(pwd)/${OUT}":/backup alpine \
  tar czf /backup/pretix-data.tar.gz -C /data .

echo "Backup complete: ${OUT}"

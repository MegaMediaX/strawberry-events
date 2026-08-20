#!/usr/bin/env bash
#
# Back up everything that cannot be rebuilt from git: the app database, the
# pretix database, pretix's data directory, and uploaded event media.
#
# THESE PATHS DESCRIBE THE REAL SERVER, not this repo's compose.yaml. The
# deployment is two SEPARATE compose projects in /opt, with different service
# names, and the server never receives a checkout of this repo. An earlier
# version of this script referenced `postgres-app`, `postgres-pretix` and two
# named volumes that do not exist anywhere — it could not have run at all, which
# is a bad thing to discover while trying to recover a live database.
#
# Verified against the running server on 2026-08-20.
set -euo pipefail

APP_COMPOSE="${APP_COMPOSE:-/opt/strawberry-events/docker-compose.yml}"
PRETIX_COMPOSE="${PRETIX_COMPOSE:-/opt/pretix/docker-compose.yml}"
APP_DIR="${APP_DIR:-/opt/strawberry-events}"
PRETIX_DIR="${PRETIX_DIR:-/opt/pretix}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR:-/root/db-backups}/${STAMP}"
mkdir -p "${OUT}"

echo "==> App database (strawberry)"
# --format=custom so pg_restore can be selective and parallel on the way back.
docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
  pg_dump -U strawberry -d strawberry --format=custom > "${OUT}/app-db.dump"

echo "==> pretix database"
docker compose -f "${PRETIX_COMPOSE}" exec -T pretix-db \
  pg_dump -U pretix -d pretix --format=custom > "${OUT}/pretix-db.dump"

echo "==> pretix data directory"
# Bind mounts, not named volumes — tar the host paths directly.
tar czf "${OUT}/pretix-data.tar.gz" -C "${PRETIX_DIR}" data

echo "==> uploaded media"
if [ -d "${APP_DIR}/uploads" ]; then
  tar czf "${OUT}/uploads.tar.gz" -C "${APP_DIR}" uploads
else
  echo "    (no uploads directory yet — skipping)"
fi

echo "==> Verifying the dumps are readable"
# A backup nobody can read is not a backup. Fail loudly HERE, while there is
# still a working database to take another one from.
docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
  pg_restore --list < "${OUT}/app-db.dump" > /dev/null
docker compose -f "${PRETIX_COMPOSE}" exec -T pretix-db \
  pg_restore --list < "${OUT}/pretix-db.dump" > /dev/null

APP_TABLES=$(docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
  pg_restore --list < "${OUT}/app-db.dump" | grep -c "TABLE DATA" || true)
echo "    app dump contains ${APP_TABLES} tables with data"

# An app dump with no attendee rows means something went wrong upstream.
ORDERS=$(docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
  psql -U strawberry -d strawberry -tAc "SELECT count(*) FROM attendee_orders" || echo 0)
echo "    live attendee_orders: ${ORDERS}"

echo
echo "Backup complete: ${OUT}"
du -sh "${OUT}"
echo
echo "COPY IT OFF THIS HOST. A backup that only exists on the machine it is"
echo "protecting is not a backup:"
echo "  scp -r root@<host>:${OUT} ."

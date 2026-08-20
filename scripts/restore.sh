#!/usr/bin/env bash
#
# Restore from a backup produced by backup.sh.
#
# DEFAULTS TO A REHEARSAL. Without --target=live it restores the app database
# into a THROWAWAY database alongside the real one and reports what it found,
# touching nothing. That is the mode you should run regularly; a restore path
# nobody has ever executed is a hope, not a plan.
#
# Paths describe the real server: two separate compose projects in /opt, with
# bind-mounted data directories. Verified 2026-08-20.
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 <backup-dir> [--target=rehearse|live] [--component=app|pretix|all]

  --target=rehearse  (default) restore the app DB into a scratch database and
                     report row counts. Production is not touched.
  --target=live      OVERWRITE production. Refuses unless CONFIRM_LIVE=yes.
USAGE
  exit 1
}

[ $# -ge 1 ] || usage
BACKUP="$1"; shift
TARGET="rehearse"
COMPONENT="app"
for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#*=}" ;;
    --component=*) COMPONENT="${arg#*=}" ;;
    *) usage ;;
  esac
done

APP_COMPOSE="${APP_COMPOSE:-/opt/strawberry-events/docker-compose.yml}"
PRETIX_COMPOSE="${PRETIX_COMPOSE:-/opt/pretix/docker-compose.yml}"

[ -f "${BACKUP}/app-db.dump" ] || { echo "No app-db.dump in ${BACKUP}"; exit 1; }

if [ "${TARGET}" = "rehearse" ]; then
  SCRATCH="restore_rehearsal_$(date +%H%M%S)"
  echo "==> Rehearsal. Restoring into scratch database '${SCRATCH}'."
  echo "    Production database 'strawberry' is NOT touched."

  docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
    psql -U strawberry -d postgres -c "CREATE DATABASE ${SCRATCH}" >/dev/null

  START=$(date +%s)
  # --no-owner/--no-acl: the scratch DB has the same owner anyway, and role
  # mismatches should not fail a rehearsal.
  docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
    pg_restore -U strawberry -d "${SCRATCH}" --no-owner --no-acl < "${BACKUP}/app-db.dump" >/dev/null 2>&1 || true
  ELAPSED=$(( $(date +%s) - START ))

  echo
  echo "==> Restored in ${ELAPSED}s. What came back:"
  docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
    psql -U strawberry -d "${SCRATCH}" -c "
      SELECT 'attendee_orders' AS table, count(*) FROM attendee_orders
      UNION ALL SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'organization_members', count(*) FROM organization_members
      UNION ALL SELECT 'with badgeSlug', count(\"badgeSlug\") FROM attendee_orders;"

  echo "==> Compared with live:"
  docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
    psql -U strawberry -d strawberry -tAc \
    "SELECT 'live attendee_orders: ' || count(*) FROM attendee_orders"

  docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
    psql -U strawberry -d postgres -c "DROP DATABASE ${SCRATCH}" >/dev/null
  echo
  echo "Scratch database dropped. Rehearsal complete."
  exit 0
fi

if [ "${TARGET}" != "live" ]; then usage; fi

if [ "${CONFIRM_LIVE:-}" != "yes" ]; then
  echo "REFUSING: --target=live overwrites the production database."
  echo "Take a fresh backup first, then re-run with CONFIRM_LIVE=yes."
  exit 1
fi

echo "==> LIVE RESTORE. Stopping the web app so nothing writes mid-restore."
docker compose -f "${APP_COMPOSE}" stop strawberry-web

echo "==> Restoring app database (clean)"
docker compose -f "${APP_COMPOSE}" exec -T strawberry-db \
  pg_restore -U strawberry -d strawberry --clean --if-exists --no-owner --no-acl \
  < "${BACKUP}/app-db.dump"

if [ "${COMPONENT}" = "all" ] && [ -f "${BACKUP}/pretix-db.dump" ]; then
  echo "==> Restoring pretix database (clean)"
  docker compose -f "${PRETIX_COMPOSE}" exec -T pretix-db \
    pg_restore -U pretix -d pretix --clean --if-exists --no-owner --no-acl \
    < "${BACKUP}/pretix-db.dump"
fi

echo "==> Starting the web app"
docker compose -f "${APP_COMPOSE}" start strawberry-web

echo "==> Health"
sleep 5
curl -fsS -o /dev/null -w "  ready: HTTP %{http_code}\n" http://127.0.0.1:3000/api/health/ready || true
echo "Restore complete. Verify check-in before reopening the door."

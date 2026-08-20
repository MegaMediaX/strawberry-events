#!/usr/bin/env bash
#
# Pull the newest backup from the event server onto this machine.
#
# Runs ON NITRO, on cron. The PULL direction is deliberate: neither the
# public-facing VPS nor this machine holds a shell credential for the other. The
# key used here is restricted on the server to a single forced command that can
# only stream a backup tar — verified: asking it to read a file serves the tar
# instead.
#
# This is the second off-site copy. The first is Google Drive, which only syncs
# while the operator's Mac is awake; this one is a machine that stays on.
set -euo pipefail

SERVER="${BACKUP_SERVER:-root@72.62.182.195}"
KEY="${BACKUP_KEY:-$HOME/.ssh/id_ed25519_backup}"
DEST="${BACKUP_DEST:-$HOME/strawberry-backups}"
KEEP="${BACKUP_KEEP:-60}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "${DEST}"
STAGING=$(mktemp -d "${DEST}/.incoming.XXXXXX")
# Always clear the staging dir, including on failure, so a broken run cannot
# leave a partial backup lying around looking like a real one.
trap 'rm -rf "${STAGING}"' EXIT

log "Fetching from ${SERVER}…"
ssh -o BatchMode=yes -o ConnectTimeout=30 -i "${KEY}" "${SERVER}" 2>/dev/null \
  | tar xf - -C "${STAGING}"

NAME=$(ls -1 "${STAGING}" | head -1)
if [ -z "${NAME}" ]; then
  log "ERROR: server sent nothing"
  exit 1
fi

# Refuse a backup whose database dump is missing or empty. A zero-byte dump that
# lands in the archive is worse than no copy — it looks like protection.
if [ ! -s "${STAGING}/${NAME}/app-db.dump" ]; then
  log "ERROR: ${NAME} has no app-db.dump — discarding"
  exit 1
fi

if [ -d "${DEST}/${NAME}" ]; then
  log "Already have ${NAME} — nothing to do."
else
  mv "${STAGING}/${NAME}" "${DEST}/${NAME}"
  log "Stored ${NAME} ($(du -sh "${DEST}/${NAME}" | cut -f1))"
fi

# Retention, newest first. Only after a successful fetch above, so a failed run
# never deletes the last good copy.
cd "${DEST}"
OLD=$(ls -1dt */ 2>/dev/null | tail -n "+$((KEEP + 1))" || true)
if [ -n "${OLD}" ]; then
  log "Pruning $(echo "${OLD}" | wc -l | tr -d ' '), keeping ${KEEP}"
  echo "${OLD}" | xargs rm -rf
fi

log "Done. ${DEST} holds $(ls -1d */ 2>/dev/null | wc -l | tr -d ' ') backup(s), $(du -sh "${DEST}" | cut -f1) total."

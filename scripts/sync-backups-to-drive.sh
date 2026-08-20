#!/usr/bin/env bash
#
# Pull the newest server backup into the local Google Drive folder, so Drive
# syncs it off-machine.
#
# Runs on the OPERATOR'S MAC, not the server. The server has no rclone and
# cannot complete a Google OAuth flow unattended, so rather than put Google
# credentials on a public-facing host we let the already-authenticated Drive
# desktop client do the upload.
#
# Consequence worth knowing: this only runs while the Mac is awake and online.
# launchd will fire a missed StartCalendarInterval job on wake, so a closed lid
# delays the copy rather than skipping it — but the server remains the primary
# copy, and this is the off-host one.
set -euo pipefail

SERVER="${BACKUP_SERVER:-root@72.62.182.195}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-/root/db-backups}"
DRIVE_ROOT="${DRIVE_ROOT:-$HOME/Library/CloudStorage/GoogleDrive-m.elmouallem.ata@gmail.com/My Drive}"
DEST="${DRIVE_DEST:-${DRIVE_ROOT}/Strawberry Backups}"
KEEP="${DRIVE_KEEP:-14}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ ! -d "${DRIVE_ROOT}" ]; then
  log "ERROR: Google Drive is not mounted at ${DRIVE_ROOT}"
  log "       Is the Google Drive app running and signed in?"
  exit 1
fi
mkdir -p "${DEST}"

LATEST=$(ssh -o BatchMode=yes -o ConnectTimeout=20 "${SERVER}" \
  "ls -1dt ${REMOTE_DIR}/*/ 2>/dev/null | head -1" | tr -d '\r\n')
if [ -z "${LATEST}" ]; then
  log "ERROR: no backups found on ${SERVER}:${REMOTE_DIR}"
  exit 1
fi

NAME=$(basename "${LATEST}")
if [ -d "${DEST}/${NAME}" ]; then
  log "Already have ${NAME} — nothing to do."
else
  log "Copying ${NAME} from the server…"
  # Staging directory, renamed into place only once the copy finishes. Drive
  # syncs whatever it sees immediately, so writing straight into DEST would
  # upload a half-copied dump and record it as a backup.
  STAGING="${DEST}/.incoming-${NAME}"
  rm -rf "${STAGING}"
  scp -q -r "${SERVER}:${LATEST}" "${STAGING}"

  if [ ! -s "${STAGING}/app-db.dump" ]; then
    log "ERROR: app-db.dump missing or empty after copy — discarding"
    rm -rf "${STAGING}"
    exit 1
  fi
  mv "${STAGING}" "${DEST}/${NAME}"
  log "Copied $(du -sh "${DEST}/${NAME}" | cut -f1) to ${DEST}/${NAME}"
fi

# Record what we have copied. Append-only, because that is the ONE mutation
# macOS TCC allows a launchd-spawned process inside ~/Library/CloudStorage.
#
# Measured on this Mac, running under launchd:
#   scp -r creating dirs and files ... allowed
#   appending to a file by path  ... allowed
#   ls / find (enumerate a dir)  ... Operation not permitted
#   touch an existing file       ... Operation not permitted
#   rm -rf a directory           ... Operation not permitted
#
# So Drive-side retention is NOT possible here without granting Full Disk Access
# to /bin/bash — a much broader permission than this task warrants. We do not
# prune Drive. Growth is about 2 MB/day, and the SERVER side prunes to 30 days,
# so the only cost is old copies accumulating in Drive where space is cheap.
#
# An earlier version tried to prune and quietly corrupted its own bookkeeping:
# the rm failed, the manifest was trimmed anyway, and the undeleted copy became
# invisible to every later run.
MANIFEST="${DEST}/.backups.manifest"
if grep -qxF "${NAME}" "${MANIFEST}" 2>/dev/null; then
  :
else
  echo "${NAME}" >> "${MANIFEST}" 2>/dev/null || log "note: could not update the manifest"
fi

COUNT=$(wc -l < "${MANIFEST}" 2>/dev/null | tr -d ' ' || echo "?")
log "Done. ${DEST} tracks ${COUNT} backup(s)."
if [ "${COUNT}" != "?" ] && [ "${COUNT}" -gt "${KEEP}" ] 2>/dev/null; then
  log "note: more than ${KEEP} copies in Drive. Deleting them needs Finder or a"
  log "      Terminal window — a background job is not permitted to."
fi

#!/usr/bin/env bash
#
# Stream the newest backup to stdout as a tar. Nothing else.
#
# This is the FORCED COMMAND behind a restricted authorized_keys entry, so the
# key that runs it cannot open a shell, forward a port, or read anything else on
# this host. That is deliberate: the pull direction matters. If the backup host
# held a key INTO this server, or this server held a key into the operator's
# home machine, a compromise of the public-facing VPS would spread. Here the
# trusted machine reaches in, and the credential it uses can only ever produce a
# backup tar.
#
# Writes the tar to stdout and every message to stderr, so the caller can just
# redirect stdout to a file.
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/root/db-backups}"

LATEST=$(ls -1dt "${BACKUP_ROOT}"/*/ 2>/dev/null | head -1 || true)
if [ -z "${LATEST}" ]; then
  echo "no backups found in ${BACKUP_ROOT}" >&2
  exit 1
fi

NAME=$(basename "${LATEST}")
echo "serving ${NAME}" >&2
# The name travels inside the tar, so the puller does not need a second call.
tar cf - -C "${BACKUP_ROOT}" "${NAME}"

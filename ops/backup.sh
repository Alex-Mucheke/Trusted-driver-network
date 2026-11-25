#!/usr/bin/env bash
# Logical backup of the Trusted Driver Network database.
#
#   DATABASE_URL=postgresql://user:pass@host:5432/tdn ./ops/backup.sh
#
# Optional: BACKUP_DIR (default ./backups), KEEP_DAYS (default 14).
# The dump contains personal data: it is written owner-only and must be stored encrypted and
# off the database host (see docs/operations/runbook.md). Run it from cron/systemd daily.
set -euo pipefail
umask 077

: "${DATABASE_URL:?Set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# Prisma-style URLs carry ?schema=public, which libpq rejects.
url="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/tdn-$stamp.dump"

# Never leave a half-written dump behind if pg_dump or the check below fails.
trap 'rm -f "$out.partial"' EXIT

pg_dump --format=custom --no-owner --no-privileges --file "$out.partial" "$url"
# A backup that cannot be listed is not a backup.
pg_restore --list "$out.partial" >/dev/null
mv "$out.partial" "$out"

find "$BACKUP_DIR" -maxdepth 1 -name 'tdn-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$out"

#!/usr/bin/env bash
# Proves a backup can actually be restored: loads it into a scratch database, checks the tables
# are there, then drops the scratch database. Run it after every backup change and at least monthly.
#
#   RESTORE_ADMIN_URL=postgresql://postgres:pass@host:5432/postgres ./ops/restore-test.sh backups/tdn-X.dump
#
# With no argument the newest dump in BACKUP_DIR (default ./backups) is used.
set -euo pipefail

: "${RESTORE_ADMIN_URL:?Set RESTORE_ADMIN_URL to a superuser/createdb connection (database: postgres)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
dump="${1:-$(ls -1t "$BACKUP_DIR"/tdn-*.dump 2>/dev/null | head -n1 || true)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "No dump file found" >&2; exit 1; }

admin="${RESTORE_ADMIN_URL%%\?*}"
scratch="tdn_restore_test_$$"
target="${admin%/*}/$scratch"

cleanup() { psql "$admin" -q -c "DROP DATABASE IF EXISTS \"$scratch\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$admin" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$scratch\""
pg_restore --no-owner --no-privileges --exit-on-error -d "$target" "$dump"

tables="$(psql "$target" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
users="$(psql "$target" -Atc 'select count(*) from "User"')"
migrations="$(psql "$target" -Atc 'select count(*) from "_prisma_migrations"' 2>/dev/null || echo 0)"

[ "$tables" -ge 20 ] || { echo "Restore looks incomplete: only $tables tables" >&2; exit 1; }
echo "OK: restored $dump -> $tables tables, $users users, $migrations applied migrations"

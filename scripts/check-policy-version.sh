#!/usr/bin/env bash
# The privacy-notice version lives in two places (API records it, web shows it). They must match,
# otherwise users would be asked to re-accept a notice that has not changed, or not asked when it has.
set -euo pipefail
cd "$(dirname "$0")/.."
extract() { grep -Eo "PRIVACY_NOTICE_VERSION = '[^']+'" "$1" | grep -Eo "'[^']+'" | tr -d "'"; }
api="$(extract backend/src/privacy/policy.ts)"
web="$(extract frontend/src/lib/policy.ts)"
if [ -z "$api" ] || [ "$api" != "$web" ]; then
  echo "Privacy notice version mismatch: backend='$api' frontend='$web'" >&2
  exit 1
fi
echo "Privacy notice version in sync: $api"

#!/usr/bin/env bash
# End-to-end smoke test against a RUNNING API (directly or through nginx).
#
#   scripts/smoke-api.sh http://localhost:3000          # API only
#   EXPECT_SECURE=1 scripts/smoke-api.sh http://...     # also require the Secure cookie flag
#
# Covers what unit tests cannot: that the real server boots, the guards and validation are wired,
# registration records consent, and the data-rights endpoints work end to end. It creates one
# throwaway account and erases it again at the end.
set -euo pipefail

BASE="${1:?usage: smoke-api.sh BASE_URL (e.g. http://localhost:3000)}"
BASE="${BASE%/}"
JSON=(-H 'Content-Type: application/json')

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
expect_status() { # expect_status <code> <description> <curl args...>
  local want="$1" what="$2"; shift 2
  local got; got="$(status "$@")"
  [ "$got" = "$want" ] || fail "$what: expected HTTP $want, got $got"
  echo "ok  $what"
}

curl -fsS "$BASE/api/health" | grep -q '"status":"ok"' || fail "liveness probe"
echo "ok  liveness"
curl -fsS "$BASE/api/health/ready" | grep -q '"database":"up"' || fail "readiness probe (database)"
echo "ok  readiness (database up)"

expect_status 401 "unauthenticated /auth/me is refused" "$BASE/api/auth/me"
expect_status 401 "unauthenticated admin route is refused" "$BASE/api/admin/users"
expect_status 401 "unauthenticated data export is refused" "$BASE/api/users/me/export"

email="smoke-$(date +%s)-$RANDOM@test.local"
phone="+2547$(printf '%08d' $(( (RANDOM * 32768 + RANDOM) % 100000000 )))"
password="smoke-test-pass-123"
reg() { # reg <acceptPrivacyNotice json value>
  printf '{"name":"Smoke Test","email":"%s","phone":"%s","password":"%s","role":"CUSTOMER","acceptPrivacyNotice":%s}' \
    "$email" "$phone" "$password" "$1"
}

expect_status 400 "registration without acknowledging the privacy notice is refused" \
  -X POST "${JSON[@]}" -d "$(reg false)" "$BASE/api/auth/register"

headers="$(curl -sS -i -X POST "${JSON[@]}" -d "$(reg true)" "$BASE/api/auth/register" | tr -d '\r')"
echo "$headers" | head -1 | grep -q ' 201' || fail "registration should return 201: $(echo "$headers" | head -1)"
cookie="$(echo "$headers" | grep -i '^set-cookie: tdn_session=' | head -1 || true)"
[ -n "$cookie" ] || fail "registration did not set the session cookie"
echo "$cookie" | grep -qi 'httponly' || fail "session cookie is not HttpOnly"
if [ "${EXPECT_SECURE:-0}" = "1" ]; then
  echo "$cookie" | grep -qi 'secure' || fail "session cookie is missing the Secure flag"
fi
echo "ok  registration sets an HttpOnly session cookie"
token="$(echo "$cookie" | sed -E 's/^[Ss]et-[Cc]ookie: tdn_session=([^;]*).*/\1/')"
AUTH=(-H "Authorization: Bearer $token")

curl -fsS "${AUTH[@]}" "$BASE/api/auth/me" | grep -q "$email" || fail "/auth/me does not return the new user"
curl -fsS "${AUTH[@]}" "$BASE/api/users/me/consents" | grep -q '"privacyNoticeAccepted":true' \
  || fail "consent was not recorded at registration"
echo "ok  consent recorded at registration"

export_json="$(curl -fsS "${AUTH[@]}" "$BASE/api/users/me/export")"
echo "$export_json" | grep -q "$email" || fail "export does not contain the account"
if echo "$export_json" | grep -qi 'passwordHash'; then fail "export leaks the password hash"; fi
echo "ok  data export works and leaks no credentials"

expect_status 400 "erasure needs the typed confirmation" \
  -X POST "${AUTH[@]}" "${JSON[@]}" -d '{"password":"'"$password"'","confirm":"nope"}' "$BASE/api/users/me/erase"
expect_status 401 "erasure needs the right password" \
  -X POST "${AUTH[@]}" "${JSON[@]}" -d '{"password":"wrong-password","confirm":"DELETE"}' "$BASE/api/users/me/erase"
expect_status 200 "account erasure succeeds" \
  -X POST "${AUTH[@]}" "${JSON[@]}" -d '{"password":"'"$password"'","confirm":"DELETE"}' "$BASE/api/users/me/erase"

expect_status 401 "an erased account's session stops working" "${AUTH[@]}" "$BASE/api/auth/me"
expect_status 401 "an erased account cannot sign in" \
  -X POST "${JSON[@]}" -d '{"email":"'"$email"'","password":"'"$password"'"}' "$BASE/api/auth/login"

echo "SMOKE OK ($BASE)"

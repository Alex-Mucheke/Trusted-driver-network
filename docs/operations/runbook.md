# Operations runbook

## Deploy
1. Set the env vars below on the host (secrets via your platform's secret store, never in git).
2. `docker compose -f docker-compose.yml -f docker-compose.full.yml up --build -d`, or build `backend/` and `frontend/` images separately.
3. The API image runs `prisma migrate deploy` on start. Take a backup first (below).
4. Check `GET /api/health/ready`, then `scripts/smoke-api.sh https://your-host`.
5. Terminate TLS in front (cookies are `Secure` in production). Set `TRUST_PROXY` to the number of proxy hops.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` enables strict validation; the API refuses to start on placeholder or short secrets, wildcard CORS, non-https `APP_URL` |
| `DATABASE_URL` | yes | Use a least-privilege role |
| `JWT_SECRET` | yes | 32+ random chars. Changing it logs everyone out |
| `MPESA_CALLBACK_SECRET` | yes | 16+ random chars |
| `CORS_ORIGIN`, `APP_URL` | yes | Exact https origins |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seed | 12+ chars; seed refuses weak ones. Never use `SEED_DEMO=true` in production |
| `COOKIE_SAMESITE` | no | `lax` default; `none` for cross-site |
| `TRUST_PROXY` | behind proxy | Hop count |
| `LOG_LEVEL` | no | `info` default |
| `SWAGGER_ENABLED` | no | Off in production unless `true` |
| `*_RETENTION_*` | no | See retention schedule |
| `VITE_OPERATOR_NAME/ADDRESS`, `VITE_PRIVACY_EMAIL` | build | Controller identity in the notice |

## Health and logs
`/api/health` (liveness), `/api/health/ready` (database). Logs are JSON with a request id (echoed in
the `x-request-id` header); they exclude IPs, cookies, bodies and query strings. Ship them to a
platform with a short retention.

## Backup and restore
- `ops/backup.sh` writes a verified `pg_dump` custom-format file and prunes old ones (`KEEP_DAYS`, default 14). Schedule it daily; copy off-host and encrypt.
- `ops/restore-test.sh <dump>` restores into a scratch database and checks tables. Run monthly.
- After any restore, re-apply erasures newer than the backup (see retention schedule).

## Rotating secrets
- `JWT_SECRET` / `MPESA_CALLBACK_SECRET`: set new values, redeploy (users must sign in again).
- **Committed secrets:** the first commit of the repository contained `backend/.env`. Rotate every value in it, then decide on a history rewrite (`git filter-repo`) plus force-push, and ask collaborators to re-clone. Rotation is what matters; the rewrite only reduces future exposure.
- Database password: change in the DB, update `DATABASE_URL`, redeploy.

## Scaling notes
- Cron jobs (retention, GPS purge, expiry) run in every API instance. They are idempotent, so duplicates are harmless but wasteful. Move to one worker or a lock if you run many replicas.
- Socket.IO needs sticky sessions or a Redis adapter beyond one instance.
- Rate limits are in memory per instance.

## Known risks
- `npm audit` reports high-severity advisories in NestJS-era dependencies that need a major framework upgrade. CI fails only on critical. Mitigation: nginx caps request bodies at 1 MB; plan the upgrade.
- No MFA/OTP, no M-Pesa STK push, no document upload yet.
- Integration tests and migration drift checks have only run in CI design, not yet observed green on GitHub.

## Upgrading
Branch, run CI, back up, deploy, smoke test, watch logs. Migrations are forward-only; to roll back restore the backup.

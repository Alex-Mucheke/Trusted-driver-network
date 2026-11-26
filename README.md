# Trusted Driver Network

[![CI](https://github.com/Alex-Mucheke/Trusted-driver-network/actions/workflows/ci.yml/badge.svg)](https://github.com/Alex-Mucheke/Trusted-driver-network/actions/workflows/ci.yml)

A relationship-first transport platform for Kenya, built from the *Platform Blueprint* and *Technical Architecture Guide*.
Customers book drivers they already trust. When that driver is busy they can refer a verified colleague, **who is only assigned after the customer approves**.

```
choose trusted driver → request → accept OR refer → replacement accepts → customer approves
   → job begins → authorised live tracking → completion → payment + receipt → review
```

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind, installable PWA, TanStack Query |
| Backend | NestJS (modular), class-validator DTOs, JWT in an HttpOnly cookie, Socket.IO |
| Data | PostgreSQL + Prisma (PostGIS can be added for proximity search later) |
| Payments | Cash for the pilot; M-Pesa callback endpoint is authenticated + idempotent, STK initiation is a stub (Phase 8) |

## Run locally

```bash
docker compose up -d                      # PostgreSQL on :5432

cd backend
cp .env.example .env                      # set JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed                       # admin + demo customer/drivers (SEED_DEMO=true)
npm run start:dev                         # API on :3000  (prefix /api)

cd ../frontend
npm install
npm run dev                               # PWA on :5173 (proxies /api and /socket.io to :3000)
```

Demo logins after seeding (password `Password123!`): `customer@example.com`, `alice@example.com`, `bob@example.com`.
Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

Try the golden flow: sign in as the customer → request a ride from Alice → sign in as Alice (another browser) → **Refer to a colleague** → Bob → Bob accepts (dashboard) → customer approves → Bob progresses the trip → customer sees live tracking.

## Run everything in Docker

One command starts PostgreSQL, the API (migrations are applied on start) and the web app behind nginx:

```bash
JWT_SECRET=$(openssl rand -hex 32) MPESA_CALLBACK_SECRET=$(openssl rand -hex 16) ADMIN_PASSWORD='choose-one' \
  docker compose -f docker-compose.yml -f docker-compose.full.yml up --build
```

Open http://localhost:8080. Optional demo data:

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml exec -e SEED_DEMO=true api npx ts-node prisma/seed.ts
```

The compose file runs the API with `NODE_ENV=development` because it serves plain http on localhost. Behind HTTPS, set `NODE_ENV=production` (cookies become `Secure`) and `TRUST_PROXY` to match your proxy so rate limits apply per client.

## Health, API docs and CI

- `GET /api/health` is a liveness probe; `GET /api/health/ready` also checks the database (use it for readiness).
- Interactive API docs live at `/api/docs`. They are on by default outside production; set `SWAGGER_ENABLED=true` to expose them in production.
- GitHub Actions runs on every PR: lint, format, typecheck, unit tests, a real-PostgreSQL integration suite, migration drift check, a fail-closed config check, a production-build boot with an end-to-end smoke test (`scripts/smoke-api.sh`), npm audit (fails on critical), gitleaks, and the full Docker stack smoke-tested through nginx.
- Operations: see `docs/operations/runbook.md`; backups with `ops/backup.sh`, restore drill with `ops/restore-test.sh`.
- Locally, in `backend/` or `frontend/`: `npm run lint`, `npm run format` (or `format:check`), and in `backend/` `npm run typecheck` and `npm test`.

## What is implemented (MVP scope from the guide)

- Accounts (customer / driver / admin), cookie sessions, role guards on every route, rate-limited auth
- Driver profiles, vehicles, services, document records, **admin verification queue**; only verified drivers can go online or be found by share link
- Shareable driver link + QR code; customer ↔ driver connections (optional driver approval, block, disconnect)
- Driver ↔ driver trusted network (mutual, canonical-ordered pair)
- Ride bookings (immediate or scheduled), server-computed fare estimate, expiry sweeper
- **Booking state machine** (`DRAFT → REQUESTED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED`, plus `DECLINED / CANCELLED / EXPIRED`) with guarded updates and an immutable `BookingEvent` log
- **Referral state machine** (`PROPOSED → CANDIDATE_ACCEPTED → CUSTOMER_APPROVED`, plus declined / rejected / expired / cancelled)
- Live tracking over an authenticated socket, plus polling fallback; chat, notifications, reviews, reports, cash receipts
- Admin console: stats, verification, users (suspend/reinstate), bookings + event timeline, referrals, reports, audit log

## Privacy and compliance (Kenya Data Protection Act, 2019)

- Registration requires accepting the privacy notice (**breaking API change:** `POST /auth/register` now needs `acceptPrivacyNotice: true`; drivers also need `consentDriverVerification: true`). Consent is stored with the notice version.
- Users can download their data and delete their account (anonymisation) in Settings; other rights requests go to an admin queue with a 30-day clock.
- Daily retention job; referral offers show distance only until the customer approves the candidate.
- Production config is validated at startup; logs are structured and free of PII.
- Drafts for counsel: `docs/compliance/` (RoPA, DPIA, retention, breach response, requests runbook, registration checklist). **Not legal advice and not yet reviewed.**

## Rules enforced on the server

- Only verified, available drivers can accept a job; eligibility is one shared service used for direct acceptance, referral candidates and re-checked inside the assignment transaction
- One assigned driver per booking: assignment locks the driver row (`FOR UPDATE`) and flips the booking with a guarded `updateMany(state = REQUESTED, assignedDriverId = null)`
- Referral: the candidate must be in the proposer's **trusted** network, accept first, then the customer approves. Approval and assignment happen in **one transaction**. `@@unique([bookingId, candidateId])` prevents loops; `MAX_REFERRAL_ATTEMPTS` caps retries
- Prices come from the server (the customer can't set a fare; a referred driver's re-quote is bounded to 0.5×–1.5× the estimate)
- Location: drivers can push GPS only for a booking they're assigned to in an active state; only the owning customer can subscribe; updates are throttled, stale fixes dropped, rows auto-expire (`LOCATION_RETENTION_MINUTES`). Before booking, customers only ever see a driver's consented ~1 km approximate area
- Customer phone is revealed only to the *assigned* driver
- Payments: one payment per booking (unique), M-Pesa callback requires a shared-secret header and cannot move a payment out of a final state

## Not done yet / needs your decision

- **File upload.** Documents are registered by storage key; the private-bucket signed-URL upload flow is not built.
- **M-Pesa STK push, SMS/push delivery, OTP login** — endpoints/hooks are stubbed (later phases).
- **Maps/geocoding.** Addresses take manual coordinates or the browser's location (with a consent dialog); plug Google Maps/Mapbox into `PlaceInput`.
- Parcels, shopping, errands: tables exist, API is intentionally rejected (`Only ride bookings…`).
- **PWA background GPS is unreliable** when the driver's screen locks (flagged in both documents). Expect to need a native driver app if the pilot shows dropped tracking.
- Open decisions from the guide that are set as env defaults, not policy: referral expiry (10 min), request expiry (15 min), max referral attempts (3), fare formula, quote bounds, data retention.
- Legal review (licensing, insurance, Kenya Data Protection Act) before the pilot.
- Realtime throttling and the socket location state are in-memory: use Redis if you run more than one API instance.

## Tests

`cd backend && npm test` runs the unit tests (mocked Prisma). `npm run test:int` runs the database integration suite against `DATABASE_URL` (CI runs it on a PostgreSQL service).

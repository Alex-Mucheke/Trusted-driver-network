# Retention schedule (draft)

Implemented in `backend/src/privacy/retention.service.ts` and `policy.ts`. Periods are **drafts**:
confirm them with counsel and the accountant, then set the env vars (see `.env.example`).
Retention runs daily at 03:15 Africa/Nairobi and is idempotent, so running it on several instances
is harmless. Section 39 of the Act requires data to be kept only as long as necessary and then
deleted, erased, anonymised or pseudonymised.

| Data | Rule | Default | Env var | Enforced by |
|---|---|---|---|---|
| Raw driver GPS points | Delete after the trip | 60 minutes | `LOCATION_RETENTION_MINUTES` | `LocationsService.purgeExpired` (every 5 min) |
| Notifications | Delete | 90 days | `NOTIFICATION_RETENTION_DAYS` | `RetentionService` |
| Chat messages | Delete once the trip is finished | 180 days | `MESSAGE_RETENTION_DAYS` | `RetentionService` |
| Trip addresses, coordinates, booking notes | Replace with `[removed]` / 0 once the trip is finished | 365 days | `RIDE_DETAILS_RETENTION_DAYS` | `RetentionService` |
| M-Pesa callback payload (has phone number) | Null out; keep the payment record | 90 days | `PAYMENT_CALLBACK_RETENTION_DAYS` | `RetentionService` |
| Payment records and receipts | Keep | **[tax/accounting period: confirm]** | none | Not purged: needs a decision |
| Safety reports, admin audit log | Keep | **[confirm]** | none | Not purged: needs a decision |
| Verification documents | Delete rows on erasure; storage objects must be deleted too | while active + **[confirm]** | none | Rows: erasure path. Storage: **not built** |
| Account data | Until the user deletes the account | n/a | none | Erasure path |
| Consent and request logs | Keep as evidence | **[confirm]** | none | Not purged |
| Application logs | Keep short | **[e.g. 30 days]** | none | Log platform setting (outside the app) |
| Database backups | Rolling | 14 days | `KEEP_DAYS` in `ops/backup.sh` | Script |

## Erasure and backups

Erasing an account anonymises the row in the live database. Existing backups still contain the old
data until they roll off (14 days by default). This is normal practice but must be stated in the
privacy notice, and a restore must never re-introduce erased people: after restoring a backup,
re-run erasure for anyone with a `ERASURE` row in `DataRequest` newer than that backup.

## What erasure keeps, and why

Bookings, payments and receipts (accounting), safety reports (safety and legal claims), the admin
audit log and consent/request logs stay, attached to an anonymised account ("Deleted user"). Names,
contact details, addresses, free-text notes, chat text, reviews' comments, location data, the
driver profile, vehicles and documents are removed.

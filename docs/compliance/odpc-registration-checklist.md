# Registration and sign-off checklist

Tick these off before the pilot handles real people's data. Owner actions are not things the
software can do for you.

## Legal
- [ ] Check with counsel or the ODPC whether you must **register as a data controller/processor** (ss.18-19; the Commissioner sets mandatory-registration thresholds). Register if required and diarise renewal.
- [ ] Decide whether you need a **Data Protection Officer** and name them in the notice.
- [ ] Counsel reviews the privacy notice, lawful bases ([ropa.md](ropa.md)) and retention periods ([retention-schedule.md](retention-schedule.md)).
- [ ] Confirm **transport licensing** (NTSA) requirements for operating as a platform; they are separate from data protection.
- [ ] Terms of service for customers and drivers (not drafted here).

## DPIA
- [ ] Owner reads and signs off [dpia.md](dpia.md). If residual risk stays high, consult the Commissioner before processing (s.31).

## Contracts and hosting
- [ ] Choose hosting; record the **region**. If outside Kenya, document the safeguard and check ss.48-50 (and whether any sensitive data needs consent to leave).
- [ ] Written processor agreements: hosting, SMS provider, M-Pesa/Safaricom.
- [ ] Backups encrypted and stored off the database host.

## In the product
- [ ] Set `VITE_OPERATOR_NAME`, `VITE_OPERATOR_ADDRESS`, `VITE_PRIVACY_EMAIL` at build time so the notice names the controller. Remove every `[bracketed]` placeholder.
- [ ] Remove the "Draft" banner from `Privacy.tsx` once counsel approves; bump `PRIVACY_NOTICE_VERSION` in **both** `backend/src/privacy/policy.ts` and `frontend/src/lib/policy.ts` (CI checks they match).
- [ ] Decide the periods marked **[confirm]** in the retention schedule and set the env vars.
- [ ] Build storage-object deletion into erasure before document upload ships.

## Operations
- [ ] Name the incident lead and backup ([breach-response.md](breach-response.md)).
- [ ] Someone checks the admin **Privacy requests** tab at least weekly.
- [ ] A restore test passes (`ops/restore-test.sh`) and is repeated monthly.
- [ ] Staff with admin access understand [data-subject-requests.md](data-subject-requests.md) and sign a confidentiality undertaking.

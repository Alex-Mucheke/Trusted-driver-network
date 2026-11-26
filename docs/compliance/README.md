# Compliance pack (Kenya Data Protection Act, 2019)

> **These are working drafts, not legal advice.** They describe what the software does today and
> what the operator still has to decide or file. Have a Kenyan data-protection lawyer review them
> before any real user's data is processed. Section numbers below were read from the ODPC-published
> text of the Act, which has some OCR errors: check them against the gazetted Act.

## What the software does today

| Obligation | Where | Status |
|---|---|---|
| Tell people what is collected and why (right to be informed, s.26) | Public notice at `/privacy` (`frontend/src/pages/Privacy.tsx`) | Built, **draft text** |
| Record consent / notice acknowledgement with version | `ConsentRecord`, written at registration; re-acknowledge flow in Settings | Built |
| Access and portability (ss.26, 38) | `GET /api/users/me/export`, Settings → Your data → Download | Built |
| Correction (s.40) | Self-edit of name/phone; other fixes via request form | Built (admin handles non-self-service) |
| Erasure (s.40) | `POST /api/users/me/erase` (password + typed confirmation) and admin erase; anonymises, keeps legally required records | Built |
| Objection / restriction (s.36) | Request form → admin queue with 30-day due date and overdue flag | Built (handled manually) |
| Storage limitation (s.39) | Daily retention job (`RetentionService`); raw GPS purged every 5 minutes | Built, **periods are drafts** |
| Data protection by design and default (s.41) | Minimal location use; referral offers withhold exact addresses; customer phone shown only to assigned driver; no IPs/cookies in logs; password hashes; HttpOnly cookies | Built |
| Breach notification (s.43, 72 hours) | Procedure in [breach-response.md](breach-response.md) | **Process only: nobody is on call yet** |
| Impact assessment (s.31) | [dpia.md](dpia.md) | Draft; needs owner sign-off |
| Registration as controller (ss.18-19) | [odpc-registration-checklist.md](odpc-registration-checklist.md) | **Not done: owner action** |
| Cross-border transfers (ss.48-50) | Depends on hosting choice | **Open decision** |

## Documents

- [Record of processing activities](ropa.md)
- [Data protection impact assessment (draft)](dpia.md)
- [Retention schedule](retention-schedule.md)
- [Handling data-subject requests](data-subject-requests.md)
- [Breach response procedure](breach-response.md)
- [Registration and sign-off checklist](odpc-registration-checklist.md)

## Known gaps (be honest with yourself before the pilot)

1. No lawyer has reviewed the notice, retention periods or lawful bases.
2. Not registered with the ODPC (confirm whether registration is mandatory for you).
3. Verification-document upload is not built, so no ID documents are stored yet. Before building it, add storage-object deletion to the erasure path (the code removes the database rows only).
4. Consent withdrawal and objection are handled by an administrator, not self-service.
5. Hosting location and any processors (hosting, SMS, M-Pesa) are not yet chosen or contracted.
6. The 30-day clock is tracked, but nothing alerts an administrator when a request is overdue.

# Handling data-subject requests

Target: answer within **30 days** of the request (the Act fixes 30 days for portability, s.38, and
"without undue delay" for correction and erasure, s.40). The admin console shows each request with
its due date and flags overdue ones.

## Self-service (nothing for an admin to do)

| Request | How the user does it | What is recorded |
|---|---|---|
| Access / portability | Settings → Your data → Download my data | `ACCESS` request, completed |
| Erasure | Settings → Your data → Delete my account (password + type `DELETE`) | `ERASURE` request, completed |
| Re-acknowledge the notice | Banner in Settings when the version changes | New `ConsentRecord` |

Erasure is refused while the user has open bookings (they must cancel or finish them) and is never
available for admin accounts.

## Needs an administrator

Console → **Privacy requests**. Requests of type correction, objection or restriction arrive here.

1. Read the request and confirm the person's identity (the request came from their signed-in account, so this is already done; for requests received by email, reply to the registered address first).
2. Do the work: edit the record, stop the processing (for example set the driver offline or suspend marketing-style notifications), or decide that you must refuse.
3. Choose **Complete** and write what was done, or **Decline** and write the reason (the person sees it). Both are written to the audit log.
4. Reasons to refuse are narrow: a legal obligation to keep the data, a legal claim, or a manifestly unfounded or excessive request. Take advice before refusing.

## Erasure requested by email or phone

Console → Users → **Erase** on the person's row. It runs the same anonymisation as self-service and
is audit-logged. Do this only after verifying the requester controls the account.

## Checklist when a request arrives from outside the app

- [ ] Log it (ask the person to also use the in-app form, or create it on their behalf).
- [ ] Verify identity.
- [ ] Respond and record the outcome.
- [ ] If the data was shared with processors, tell them (hosting, SMS, payments).

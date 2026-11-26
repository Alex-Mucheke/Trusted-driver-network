# Personal data breach response

**Legal clock (s.43):** the controller must notify the Data Protection Commissioner **within 72
hours** of becoming aware of a breach, and tell affected people in writing within a reasonably
practicable period where there is a real risk of harm (not required where the data was protected,
for example by encryption). A processor must tell the controller without delay, ideally within 48
hours. Late notices must explain the delay. Confirm the current wording and the ODPC's notification
channel with counsel.

## Roles (fill in before launch)

| Role | Person | Backup |
|---|---|---|
| Incident lead | [name, phone] | [name] |
| Technical lead | [name, phone] | [name] |
| Decision on notifying the ODPC / users | [name] | [name] |
| Communications | [name] | [name] |

## First hour

1. **Contain.** Revoke the exposed credential, rotate secrets (`JWT_SECRET` invalidates every session; see the runbook), suspend affected accounts, block the attacker, take the affected component offline if needed. Do not delete evidence.
2. **Record the time you became aware.** The 72 hours start here.
3. **Preserve evidence.** Copy logs and database snapshots to a restricted location.

## Assess (same day)

- What data, which people, how many, since when?
- Was it readable by the attacker (not encrypted or hashed)? Passwords are bcrypt hashes; location, addresses, phone numbers and documents are not.
- Is there a real risk of harm (identity fraud, stalking, physical safety)? Location and home-address data raise this quickly.

## Notify

- **ODPC within 72 hours** if the breach is notifiable: what happened, data and people affected, likely consequences, what you are doing, who to contact. Send a first notice even if details are incomplete, then follow up.
- **Affected people** in plain language: what happened, what data, what they should do (change password, watch for scams), how to reach you. Use SMS/email and an in-app notice.
- **Processors / partners** (hosting, payments) as needed.

## Afterwards

- Fix the root cause; add a test or check so it cannot recur.
- Write a short post-incident review.
- Keep a **breach register** (date aware, description, data, people, decision on notification and why, actions). Keep it even for breaches you decide not to report.

## Known weak spots to remove before launch

- The very first commit of this repository contained a `.env` file. Treat those secrets as exposed: rotate them and clean the history (see the runbook).
- Documents in object storage must be private and served only by short-lived signed URLs (not built yet).

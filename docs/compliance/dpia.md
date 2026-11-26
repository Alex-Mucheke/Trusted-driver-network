# Data protection impact assessment (draft, s.31)

Status: **draft for owner sign-off and counsel review.** Not legal advice.

## 1. Why a DPIA
The platform processes location data of identifiable drivers and customers, identity documents
(planned), and records who travels where and with whom. That is high-risk processing under s.31.

## 2. Processing
See [ropa.md](ropa.md). Scale at pilot: hundreds of users. Hosting and processors are not yet chosen.

## 3. Necessity and proportionality
- Location: exact GPS is used only while a trip is active and deleted after about an hour. Availability uses ~1 km rounding.
- Driver documents: needed to verify drivers; not yet collected.
- Customers' contact details: the assigned driver sees the phone number; other drivers do not.
- Referrals: a candidate driver sees distance and a rounded area only, with exact addresses shown after the customer approves them (fixed during review; earlier code sent exact addresses with the offer).

## 4. Risks and controls

| Risk | Likelihood / impact | Controls in place | Residual / action |
|---|---|---|---|
| Stalking or harm using a customer's addresses or a driver's location | Medium / high | Limited audience per field, short GPS retention, rounded availability, address scrubbing after 12 months | Medium. Add rate limits on location reads; review abuse reports promptly |
| Public driver share page (`/api/drivers/public/:shareCode`) exposes name, photo, bio, service area, vehicle plate, availability to anyone with the link | Medium / medium | Link is unguessable, driver controls sharing | **Open:** let drivers choose which fields are public and revoke the code |
| Account takeover | Medium / high | bcrypt, rate limits, HttpOnly cookie, fail-closed secrets | No MFA or OTP yet. Add before launch |
| Database or backup leak | Low / high | Private network DB, least-privilege role (to set up), backup retention 14 days | Encrypt backups; encrypted volumes at host |
| Secrets in git history (first commit had a `.env`) | Known / high | None until rotated | **Rotate secrets; consider history rewrite** |
| Over-retention | Medium / medium | Daily retention job | Periods unconfirmed |
| Failure to answer rights requests in 30 days | Medium / medium | Queue with due dates and overdue flag | No alerting; weekly review |
| Unlawful transfer abroad | Unknown | None | Pick Kenyan or adequate-jurisdiction hosting; contract |
| Verification documents exposed | Not live | Not built | Private bucket, signed URLs, deletion on erasure |
| Admin misuse | Low / high | Audit log of admin actions | Add read-access logging and role separation |
| Free-text reports hold sensitive details | Medium / medium | Admin-only access | Define retention |

## 5. Consultation
- [ ] Drivers and customers (pilot feedback)
- [ ] Counsel
- [ ] Commissioner, if residual risk remains high

## 6. Sign-off
Owner: ________  Date: ________  Next review: before pilot, then yearly or on any new data type.

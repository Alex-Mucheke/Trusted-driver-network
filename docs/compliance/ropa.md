# Record of processing activities (draft)

Controller: **[operator legal name]**. Contact: **[privacy email]**. Data protection officer: **[to be decided]**.

| # | Activity | Data subjects | Personal data | Purpose | Proposed lawful basis* | Recipients | Retention | Source in code |
|---|---|---|---|---|---|---|---|---|
| 1 | Accounts and sign-in | Customers, drivers, admins | Name, email, phone, password hash, roles | Provide the service; contact users | Contract | Admins | Until account deletion | `User` |
| 2 | Driver verification | Drivers | National ID, driving licence, PSV badge, insurance, logbook, photo, vehicle details | Safety: confirm identity and eligibility | Consent + legitimate interest | Admins | Active driver + [period] | `VerificationDocument`, `Vehicle` (upload flow not built yet) |
| 3 | Bookings | Customers, drivers | Pickup/drop-off addresses and coordinates, time, fare, notes, status history | Arrange and complete trips; resolve disputes | Contract | Customer, requested/assigned driver; a referred driver sees approximate area only until approved | Addresses/notes: 12 months after trip | `Booking`, `RideDetails`, `BookingEvent` |
| 4 | Live tracking | Drivers (and so customers) | Precise GPS during an active trip only | Show the driver's progress | Contract; consent for browser location | Customer of that trip | Raw points ~1 hour | `DriverLocation` |
| 5 | Approximate availability | Drivers who opt in | Position rounded to ~1 km | Show who is nearby | Consent | Customers connected to the driver | Until changed | `DriverProfile.approx*` |
| 6 | Trusted network | Drivers, customers | Who is connected/trusted | Referral eligibility | Contract | Counterparties | Until disconnection or deletion | `CustomerDriverConnection`, `DriverConnection` |
| 7 | Referrals | Customers, drivers | Booking summary, replacement identity | Offer a replacement driver | Contract | Referred driver (limited), customer | With booking | `Referral` |
| 8 | Chat | Customers, drivers | Message text | Coordinate a trip | Contract | Both parties | 180 days after trip | `Message` |
| 9 | Payments | Customers | Amounts, method, receipt no., M-Pesa callback (includes phone) | Record payment, receipts | Contract; legal obligation | Payment provider [tbd] | Record: [legal period]; callback payload 90 days | `Payment` |
| 10 | Reviews and safety reports | Customers, drivers | Ratings, comments, report text | Quality and safety | Legitimate interest | Admins | Reports: [period] | `Review`, `Report` |
| 11 | Notifications | All | Event messages | Keep users informed | Contract | None | 90 days | `Notification` |
| 12 | Admin oversight | Admins, all users | Admin actions, user/booking views | Verification, support, abuse handling | Legitimate interest | Admins | Audit log: [period] | `AdminAuditLog` |
| 13 | Operational logs | All | Request path, status, request id (no IP, cookies, bodies, query strings) | Run and fix the service | Legitimate interest | Ops | [e.g. 30 days, set in the log platform] | `common/logging.ts` |
| 14 | Consent and rights requests | All | Consent versions, request log | Prove compliance | Legal obligation | Admins | Kept (compliance evidence) | `ConsentRecord`, `DataRequest` |

\* Proposed only. Confirm with counsel. Data that may count as sensitive under s.2 (for example
biometric data if photos are ever used for matching, or "property details" such as vehicle
logbooks) needs extra care; see the DPIA.

Processors and transfers: **[hosting provider and region]**, **[SMS provider]**, **[M-Pesa / Safaricom]**. Each needs a written contract and, if data leaves Kenya, a documented safeguard (ss.48-50).

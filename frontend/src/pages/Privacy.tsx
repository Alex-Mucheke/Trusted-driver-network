import { Link } from 'react-router-dom';
import { OPERATOR, PRIVACY_NOTICE_VERSION } from '../lib/policy';

const collected: Array<[string, string, string]> = [
  [
    'Account',
    'Name, email, phone number, password (stored only as a one-way hash), account type.',
    'To create your account, sign you in and contact you about your bookings.',
  ],
  [
    'Driver verification',
    'National ID, driving licence, PSV badge, insurance, vehicle logbook, vehicle details and photo.',
    'To check drivers are who they say they are before customers can rely on them.',
  ],
  [
    'Bookings',
    'Pickup and drop-off addresses and coordinates, time, fare, notes, status history.',
    'To arrange and complete your trip and to resolve disputes.',
  ],
  [
    'Location',
    'Drivers: precise GPS only while assigned to an active trip, and (only if the driver chooses) an approximate ~1 km area. Customers: your device location only when you allow it.',
    'To show a customer their driver on the way. Tracking stops when the trip ends or is cancelled.',
  ],
  [
    'Messages, reviews, reports',
    'Trip chat, ratings and comments, safety reports.',
    'To let you and your driver coordinate, and to keep people safe.',
  ],
  [
    'Payments',
    'Amount, method (cash or M-Pesa), receipt number and, for M-Pesa, the payment confirmation from the provider (which includes a phone number).',
    'To record payments and issue receipts.',
  ],
  [
    'Technical logs',
    'Request path, status code and a random request id. We do not log passwords, cookies, IP addresses or query strings.',
    'To keep the service running and investigate faults.',
  ],
];

const retention: Array<[string, string]> = [
  ['Notifications', '90 days'],
  ['Trip chat messages (finished trips)', '180 days'],
  ['Trip addresses and booking notes', '12 months after the trip ends, then removed'],
  ['M-Pesa confirmation payloads', '90 days (the payment record itself is kept)'],
  ['Precise driver GPS points', 'Deleted automatically within about an hour'],
  ['Payments and receipts', '[period required by Kenyan tax and accounting law: to be confirmed]'],
  ['Safety reports and admin audit log', '[period to be confirmed]'],
  [
    'Driver verification documents',
    'While you are an active driver, then [period to be confirmed]',
  ],
  ['Account details', 'Until you delete your account'],
];

export default function Privacy() {
  return (
    <article className="card space-y-6 text-sm leading-relaxed text-slate-700">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Privacy notice</h1>
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
          <strong>Draft for the pilot.</strong> This notice has not yet been reviewed by a lawyer.
          Items in [square brackets] are still to be confirmed. Version {PRIVACY_NOTICE_VERSION}.
        </p>
      </header>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Who we are</h2>
        <p>
          {OPERATOR.name}, {OPERATOR.address}, runs Trusted Driver Network and decides how your
          personal data is used (the "data controller" under Kenya&apos;s Data Protection Act,
          2019). Contact for anything in this notice: {OPERATOR.privacyEmail}.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-900">What we collect and why</h2>
        <ul className="space-y-3">
          {collected.map(([title, what, why]) => (
            <li key={title}>
              <p className="font-medium text-slate-900">{title}</p>
              <p>{what}</p>
              <p className="text-slate-500">Why: {why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">On what basis (proposed)</h2>
        <p>
          Providing the booking service you asked for; your consent where we ask for it (driver
          document verification, device location); our legitimate interest in keeping riders and
          drivers safe and preventing fraud; and legal obligations such as keeping payment records.
          [Final legal bases to be confirmed by counsel.]
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Who can see your data</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A customer&apos;s phone number is shown only to the driver assigned to their trip.
          </li>
          <li>Customers see a driver&apos;s name, photo and vehicle details.</li>
          <li>
            A referred replacement driver sees the trip details only after they are offered the job,
            and is assigned only if the customer approves.
          </li>
          <li>
            Our administrators can see account, verification and safety information when needed to
            verify drivers, handle reports and support you. Their actions are logged.
          </li>
          <li>
            Service providers that process data for us: [hosting provider], and for M-Pesa payments
            [payment provider]. We do not sell personal data.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate-900">How long we keep it</h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {retention.map(([what, how]) => (
            <div
              key={what}
              className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between"
            >
              <dt className="font-medium text-slate-900">{what}</dt>
              <dd className="sm:text-right">{how}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Your rights</h2>
        <p>
          In{' '}
          <Link className="text-brand-700 underline" to="/settings">
            Settings → Your data
          </Link>{' '}
          you can, at any time:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>download everything we hold about you as a file;</li>
          <li>correct your name and phone number;</li>
          <li>ask us to correct other data, to stop or limit how we use it, or to object to it;</li>
          <li>
            delete your account. This removes your personal details and trip addresses. We keep
            payment records and safety reports where the law or safety requires, without your name
            attached.
          </li>
        </ul>
        <p>
          We aim to answer requests within 30 days. If you are not satisfied you can complain to the
          Office of the Data Protection Commissioner (odpc.go.ke).
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Security</h2>
        <p>
          Passwords are stored as one-way hashes; your session cookie cannot be read by scripts;
          traffic is encrypted in transit when the service is served over HTTPS; access to
          verification documents is restricted. No system is perfectly secure: if there is a breach
          that puts you at risk we will tell you and the Data Protection Commissioner as the law
          requires.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Where data is stored</h2>
        <p>[Hosting location and any transfer outside Kenya, with safeguards: to be confirmed.]</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Children</h2>
        <p>The service is for people aged 18 and over.</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold text-slate-900">Changes</h2>
        <p>
          If this notice changes in a way that matters we will update the version above and ask you
          to confirm you have read it.
        </p>
      </section>
    </article>
  );
}

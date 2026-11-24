import { Link } from 'react-router-dom';

const steps = [
  [
    'Choose a driver you trust',
    'Scan their QR code or open their link to add them to your trusted drivers.',
  ],
  [
    'Send your request',
    'Pick pickup, destination and time. You see a transparent estimate up front.',
  ],
  [
    'Driver accepts or refers',
    'Busy? Your driver can suggest a verified colleague from their own trusted network.',
  ],
  [
    'You approve the replacement',
    'You see the driver, vehicle, arrival time and price, and nothing changes without your OK.',
  ],
  [
    'Ride, track, pay, rate',
    'Live tracking is on only during your active trip. Pay cash and get a receipt.',
  ],
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <img src="/icon.svg" alt="" className="h-14 w-14" />
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
        Book the drivers you already trust.
      </h1>
      <p className="mt-3 text-lg text-slate-600">
        A relationship-first rides platform. When your usual driver is busy, a colleague they vouch
        for can step in, but only if you approve.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="btn-primary" to="/register?role=CUSTOMER">
          I need rides
        </Link>
        <Link className="btn-secondary" to="/register?role=DRIVER">
          I'm a driver
        </Link>
        <Link className="btn-secondary" to="/login">
          Sign in
        </Link>
      </div>
      <ol className="mt-10 space-y-4">
        {steps.map(([t, d], i) => (
          <li key={t} className="card flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold">{t}</h2>
              <p className="text-sm text-slate-600">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

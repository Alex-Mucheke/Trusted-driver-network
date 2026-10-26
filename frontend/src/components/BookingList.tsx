import { Link } from 'react-router-dom';
import type { Booking } from '../lib/types';
import { BookingBadge, kes, when } from './ui';

export function BookingList({ bookings, viewer }: { bookings: Booking[]; viewer: 'customer' | 'driver' }) {
  return (
    <ul className="space-y-3">
      {bookings.map((b) => {
        const driver = b.assignedDriver ?? b.requestedDriver;
        return (
          <li key={b.id}>
            <Link to={`/bookings/${b.id}`} className="card block space-y-1 hover:border-brand-500">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{viewer === 'customer' ? driver.name : b.customer.name}</span>
                <BookingBadge state={b.state} />
              </div>
              {b.rideDetails && (
                <p className="text-sm text-slate-600">{b.rideDetails.pickupAddress} → {b.rideDetails.dropoffAddress}</p>
              )}
              <p className="text-xs text-slate-500">
                {b.scheduledAt ? `Scheduled ${when(b.scheduledAt)}` : `Requested ${when(b.createdAt)}`} · {kes(b.quote)}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

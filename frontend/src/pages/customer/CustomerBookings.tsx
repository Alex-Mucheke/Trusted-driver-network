import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import type { Booking } from '../../lib/types';
import { BookingList } from '../../components/BookingList';
import { Empty, ErrorBox, Spinner } from '../../components/ui';

export default function CustomerBookings() {
  const q = useQuery({ queryKey: ['bookings', 'customer'], queryFn: () => get<Booking[]>('/bookings') });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My bookings</h1>
      <ErrorBox error={q.error} />
      {q.isLoading ? <Spinner /> : q.data?.length ? <BookingList bookings={q.data} viewer="customer" /> : <Empty title="No bookings yet" hint="Request a ride from one of your trusted drivers." />}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import type { Booking } from '../../lib/types';
import { BookingList } from '../../components/BookingList';
import { Empty, ErrorBox, Spinner } from '../../components/ui';

const TABS = [
  ['', 'All'], ['REQUESTED', 'Requests'], ['ACCEPTED', 'Scheduled'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'],
] as const;

export default function DriverJobs() {
  const [state, setState] = useState<string>('');
  const q = useQuery({ queryKey: ['bookings', 'driver', 'jobs', state], queryFn: () => get<Booking[]>(`/bookings${state ? `?state=${state}` : ''}`) });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Jobs</h1>
      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map(([s, label]) => (
          <button key={s} role="tab" aria-selected={state === s} onClick={() => setState(s)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${state === s ? 'bg-brand-100 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>
        ))}
      </div>
      <ErrorBox error={q.error} />
      {q.isLoading ? <Spinner /> : q.data?.length ? <BookingList bookings={q.data} viewer="driver" /> : <Empty title="Nothing here yet" />}
    </div>
  );
}

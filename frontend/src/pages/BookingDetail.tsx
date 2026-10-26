import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Booking, BookingState } from '../lib/types';
import { Badge, BookingBadge, ErrorBox, Field, kes, ReferralBadge, Spinner, vehicleLine, when } from '../components/ui';
import { LiveTracking } from '../components/booking/LiveTracking';
import { GpsSharing } from '../components/booking/GpsSharing';
import { Chat } from '../components/booking/Chat';
import { CustomerReferralPanel } from '../components/booking/ReferralPanel';
import { ReferDialog } from '../components/booking/ReferDialog';

const ACTIVE: BookingState[] = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
const NEXT: Partial<Record<BookingState, { to: string; label: string }>> = {
  ACCEPTED: { to: 'EN_ROUTE', label: 'Start heading to pickup' },
  EN_ROUTE: { to: 'ARRIVED', label: "I've arrived" },
  ARRIVED: { to: 'IN_PROGRESS', label: 'Start trip' },
  IN_PROGRESS: { to: 'COMPLETED', label: 'Complete trip' },
};
const OPEN_REF = ['PROPOSED', 'CANDIDATE_ACCEPTED'];

export default function BookingDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => get<Booking>(`/bookings/${id}`), refetchInterval: 30_000 });
  const [refer, setRefer] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['booking', id] }); qc.invalidateQueries({ queryKey: ['bookings'] }); };
  const act = useMutation({ mutationFn: (p: { path: string; body?: unknown }) => post(`/bookings/${id}/${p.path}`, p.body ?? {}), onSuccess: refresh });
  const cancelRef = useMutation({ mutationFn: (rid: string) => post(`/referrals/${rid}/cancel`), onSuccess: refresh });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data || !user) return <ErrorBox error={q.error ?? new Error('Booking not found')} />;
  const b = q.data;

  const isCustomer = b.customerId === user.id;
  const isAssigned = b.assignedDriverId === user.id;
  const isRequested = b.requestedDriverId === user.id && !b.assignedDriverId;
  const driver = b.assignedDriver ?? b.requestedDriver;
  const openRef = b.referrals?.find((r) => OPEN_REF.includes(r.state));
  const customerRef = b.referrals?.find((r) => r.state === 'CANDIDATE_ACCEPTED') ?? b.referrals?.find((r) => r.state === 'PROPOSED');
  const canCancel = isCustomer ? ['REQUESTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(b.state) : isAssigned && ['ACCEPTED', 'EN_ROUTE', 'ARRIVED'].includes(b.state);
  const next = isAssigned ? NEXT[b.state] : undefined;
  const r = b.rideDetails;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{isCustomer ? `Ride with ${driver.name}` : `Ride for ${b.customer.name}`}</h1>
            <p className="text-sm text-slate-500">{b.scheduledAt ? `Scheduled ${when(b.scheduledAt)}` : `Requested ${when(b.createdAt)}`}</p>
          </div>
          <BookingBadge state={b.state} />
        </div>
        {r && (
          <ol className="space-y-1 text-sm">
            <li><span className="text-slate-500">Pickup:</span> {r.pickupAddress}</li>
            <li><span className="text-slate-500">Destination:</span> {r.dropoffAddress}</li>
            <li className="text-slate-500">{r.distanceKm} km straight-line · {b.passengerCount} passenger{b.passengerCount > 1 ? 's' : ''}</li>
          </ol>
        )}
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-slate-500">Estimated fare</span>
          <span className="text-lg font-semibold">{kes(b.quote)}</span>
        </div>
        {isCustomer && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium">{driver.name} {b.assignedDriver ? <Badge color="green">Assigned</Badge> : <Badge color="amber">Awaiting response</Badge>}</p>
            <p className="text-slate-600">{vehicleLine(driver.driverProfile?.vehicles?.[0])}</p>
          </div>
        )}
        {isAssigned && b.customer.phone && <p className="text-sm">Customer phone: <a className="text-brand-700 underline" href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></p>}
        {b.notes && <p className="text-sm text-slate-600">Note: {b.notes}</p>}
      </div>

      <ErrorBox error={act.error ?? cancelRef.error} />

      {/* ---------- customer: referral consent ---------- */}
      {isCustomer && !b.assignedDriverId && b.state === 'REQUESTED' && customerRef && <CustomerReferralPanel booking={b} referral={customerRef} />}
      {isCustomer && b.state === 'REQUESTED' && !customerRef && <p className="card text-sm text-slate-600">Waiting for {b.requestedDriver.name} to respond. Requests expire {when(b.expiresAt)}.</p>}

      {/* ---------- requested driver: accept / decline / refer ---------- */}
      {isRequested && b.state === 'REQUESTED' && (
        <div className="card space-y-3">
          <h2 className="font-semibold">New request</h2>
          {openRef ? (
            <div className="space-y-2 text-sm">
              <p>Referral to {openRef.candidate?.name} <ReferralBadge state={openRef.state} /></p>
              <p className="text-slate-500">{openRef.state === 'PROPOSED' ? 'Waiting for your colleague to accept.' : 'Waiting for the customer to approve.'}</p>
              <button className="btn-secondary" onClick={() => cancelRef.mutate(openRef.id)}>Cancel referral</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={act.isPending} onClick={() => act.mutate({ path: 'accept' })}>Accept</button>
              <button className="btn-secondary" onClick={() => setRefer(true)}>Refer to a colleague</button>
              <button className="btn-secondary" disabled={act.isPending} onClick={() => act.mutate({ path: 'decline' })}>Decline</button>
            </div>
          )}
        </div>
      )}
      {refer && <ReferDialog bookingId={b.id} onClose={() => setRefer(false)} />}

      {/* ---------- assigned driver: progress + GPS ---------- */}
      {isAssigned && ACTIVE.includes(b.state) && (
        <>
          {next && <button className="btn-primary w-full !py-3 text-base" disabled={act.isPending} onClick={() => act.mutate({ path: 'status', body: { state: next.to } })}>{next.label}</button>}
          <GpsSharing bookingId={b.id} />
        </>
      )}
      {isAssigned && b.state === 'COMPLETED' && !b.payment && <CashForm bookingId={b.id} quote={b.quote} onDone={refresh} />}

      {/* ---------- customer: live tracking ---------- */}
      {isCustomer && ACTIVE.includes(b.state) && ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ACCEPTED'].includes(b.state) && <LiveTracking bookingId={b.id} />}

      {canCancel && (
        <button className="btn-secondary w-full" disabled={act.isPending}
          onClick={() => { const reason = prompt('Reason for cancelling (optional)'); if (reason !== null) act.mutate({ path: 'cancel', body: { reason: reason || undefined } }); }}>
          Cancel booking
        </button>
      )}

      {(isCustomer || isAssigned) && b.assignedDriverId && !['CANCELLED', 'DECLINED', 'EXPIRED'].includes(b.state) && <Chat bookingId={b.id} meId={user.id} />}

      {b.payment && (
        <div className="card space-y-1 text-sm">
          <h2 className="font-semibold">Receipt {b.payment.receiptNumber}</h2>
          <p>Service charge {kes(b.payment.serviceCharge)}{b.payment.tip > 0 && ` · Tip ${kes(b.payment.tip)}`}</p>
          <p className="font-medium">Total {kes(b.payment.total)} · {b.payment.method.toLowerCase()} · {b.payment.state.toLowerCase()}</p>
        </div>
      )}

      {isCustomer && b.state === 'COMPLETED' && !b.review && <ReviewForm bookingId={b.id} onDone={refresh} />}
      {b.review && <p className="text-sm text-slate-600">You rated this trip {b.review.rating} ★</p>}

      {(isCustomer || isAssigned) && b.assignedDriverId && <ReportBox bookingId={b.id} targetUserId={isCustomer ? b.assignedDriverId : b.customerId} />}

      {b.events && b.events.length > 0 && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-medium">Activity log</summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {b.events.map((e) => <li key={e.id}>{when(e.createdAt)} · {e.type.replace(/_/g, ' ').toLowerCase()}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function CashForm({ bookingId, quote, onDone }: { bookingId: string; quote: number; onDone: () => void }) {
  const [tip, setTip] = useState(0);
  const m = useMutation({ mutationFn: () => post('/payments/cash', { bookingId, tip }), onSuccess: onDone });
  return (
    <form className="card space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
      <h2 className="font-semibold">Record cash payment</h2>
      <p className="text-sm text-slate-600">Fare {kes(quote)} is set from the booking. Add any tip you received in cash.</p>
      <Field label="Tip (KES)"><input className="input" type="number" min={0} value={tip} onChange={(e) => setTip(Math.max(0, Math.floor(+e.target.value || 0)))} /></Field>
      <ErrorBox error={m.error} />
      <button className="btn-primary" disabled={m.isPending}>Record {kes(quote + tip)} received</button>
    </form>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const m = useMutation({ mutationFn: () => post('/reviews', { bookingId, rating, comment: comment || undefined }), onSuccess: onDone });
  return (
    <form className="card space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
      <h2 className="font-semibold">Rate your trip</h2>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`text-2xl ${n <= rating ? 'text-amber-500' : 'text-slate-300'}`} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <input className="input" placeholder="Comment (optional)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      <ErrorBox error={m.error} />
      <button className="btn-primary" disabled={m.isPending}>Submit rating</button>
    </form>
  );
}

function ReportBox({ bookingId, targetUserId }: { bookingId: string; targetUserId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('Safety concern');
  const [description, setDescription] = useState('');
  const m = useMutation({ mutationFn: () => post('/reports', { bookingId, targetUserId, category, description, type: 'INCIDENT' }), onSuccess: () => { setOpen(false); setDescription(''); } });
  if (!open) return <button className="text-sm text-slate-500 underline" onClick={() => setOpen(true)}>Report a problem with this trip</button>;
  return (
    <form className="card space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
      <h2 className="font-semibold">Report a problem</h2>
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        {['Safety concern', 'Behaviour', 'Fare dispute', 'Vehicle does not match', 'Other'].map((c) => <option key={c}>{c}</option>)}
      </select>
      <textarea className="input" rows={3} required minLength={5} maxLength={2000} placeholder="What happened?" value={description} onChange={(e) => setDescription(e.target.value)} />
      <p className="text-xs text-slate-500">In an emergency contact local emergency services first. Reports are reviewed by our support team.</p>
      <ErrorBox error={m.error} />
      <div className="flex gap-2"><button className="btn-primary" disabled={m.isPending}>Send report</button><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

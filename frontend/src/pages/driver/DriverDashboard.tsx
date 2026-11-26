import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, put } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Booking, Referral } from '../../lib/types';
import {
  Badge,
  BookingBadge,
  Empty,
  ErrorBox,
  kes,
  Modal,
  Spinner,
  when,
} from '../../components/ui';

interface Profile {
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  verificationNote: string | null;
  availability: 'ONLINE' | 'OFFLINE';
  shareApproxLocation: boolean;
  vehicles: { id: string; active: boolean }[];
  documents: { id: string }[];
}

interface IncomingReferral extends Referral {
  proposer: { name: string };
  booking: {
    id: string;
    quote: number;
    scheduledAt: string | null;
    passengerCount: number;
    rideDetails: Booking['rideDetails'];
  };
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['driver-me'], queryFn: () => get<Profile>('/drivers/me') });
  const bookings = useQuery({
    queryKey: ['bookings', 'driver'],
    queryFn: () => get<Booking[]>('/bookings'),
  });
  const referrals = useQuery({
    queryKey: ['referrals', 'incoming'],
    queryFn: () => get<IncomingReferral[]>('/referrals/incoming'),
    refetchInterval: 20_000,
  });
  const [consent, setConsent] = useState(false);
  const [respond, setRespond] = useState<IncomingReferral | null>(null);

  const setAvail = useMutation({
    mutationFn: async (v: { availability: 'ONLINE' | 'OFFLINE'; share?: boolean }) => {
      // Approximate area is only captured with consent, and the server rounds it to ~1 km.
      let lat: number | undefined;
      let lng: number | undefined;
      if (v.availability === 'ONLINE' && v.share && navigator.geolocation) {
        await new Promise<void>((res) =>
          navigator.geolocation.getCurrentPosition(
            (p) => {
              lat = p.coords.latitude;
              lng = p.coords.longitude;
              res();
            },
            () => res(),
            { timeout: 8000 },
          ),
        );
      }
      return put('/drivers/me/availability', {
        availability: v.availability,
        shareApproxLocation: v.share,
        lat,
        lng,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver-me'] }),
  });

  if (profile.isLoading || bookings.isLoading) return <Spinner />;
  const p = profile.data;
  const all = bookings.data ?? [];
  const requests = all.filter(
    (b) => b.state === 'REQUESTED' && b.requestedDriverId === user?.id && !b.assignedDriverId,
  );
  const active = all.filter(
    (b) =>
      b.assignedDriverId === user?.id &&
      ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.state),
  );
  const done = all.filter((b) => b.assignedDriverId === user?.id && b.state === 'COMPLETED');
  const verified = p?.verificationStatus === 'APPROVED';

  return (
    <div className="space-y-4">
      <ErrorBox error={profile.error ?? bookings.error ?? setAvail.error} />

      {!verified && p && (
        <div
          className={`card ${p.verificationStatus === 'REJECTED' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}
        >
          <h2 className="font-semibold">
            {p.verificationStatus === 'REJECTED'
              ? 'Verification needs attention'
              : 'Verification pending'}
          </h2>
          <p className="text-sm text-slate-700">
            {p.verificationStatus === 'REJECTED'
              ? (p.verificationNote ?? 'Please review your documents and resubmit.')
              : p.documents.length === 0 || p.vehicles.length === 0
                ? 'Add your vehicle and submit identity, licence and vehicle documents to get verified.'
                : 'Our team is reviewing your documents. You can go online once approved.'}
          </p>
          <Link className="btn-secondary mt-2" to="/driver/profile">
            Complete profile
          </Link>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">
              {p?.availability === 'ONLINE' ? 'You are online' : 'You are offline'}
            </h1>
            <p className="text-sm text-slate-500">
              Customers and colleagues can only send you work while you are online.
            </p>
          </div>
          <button
            className={p?.availability === 'ONLINE' ? 'btn-secondary' : 'btn-primary'}
            disabled={!verified || setAvail.isPending}
            onClick={() =>
              p?.availability === 'ONLINE'
                ? setAvail.mutate({ availability: 'OFFLINE', share: false })
                : setConsent(true)
            }
          >
            {p?.availability === 'ONLINE' ? 'Go offline' : 'Go online'}
          </button>
        </div>
        {p?.availability === 'ONLINE' && p.shareApproxLocation && (
          <Badge color="blue">Sharing approximate area with connected customers</Badge>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Incoming referrals</h2>
        {referrals.data?.length ? (
          referrals.data.map((r) => (
            <div key={r.id} className="card space-y-2">
              <p className="text-sm">
                <strong>{r.proposer.name}</strong> referred a ride to you
              </p>
              {r.booking.rideDetails && (
                <p className="text-sm text-slate-600">
                  About {r.booking.rideDetails.distanceKm} km. Exact pickup and drop-off are shown
                  once the customer approves you.
                </p>
              )}
              <p className="text-xs text-slate-500">
                {kes(r.booking.quote)} · expires {when(r.expiresAt)}
              </p>
              <button className="btn-primary" onClick={() => setRespond(r)}>
                Respond
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">None right now.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Requests for you</h2>
        {requests.length ? (
          requests.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="card block hover:border-brand-500">
              <div className="flex justify-between">
                <span className="font-medium">{b.customer.name}</span>
                <BookingBadge state={b.state} />
              </div>
              <p className="text-sm text-slate-600">
                {b.rideDetails?.pickupAddress} → {b.rideDetails?.dropoffAddress}
              </p>
              <p className="text-xs text-slate-500">
                {kes(b.quote)} · {b.scheduledAt ? `scheduled ${when(b.scheduledAt)}` : 'now'}
              </p>
            </Link>
          ))
        ) : (
          <Empty title="No pending requests" />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Active job</h2>
        {active.length ? (
          active.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="card block border-brand-500">
              <div className="flex justify-between">
                <span className="font-medium">{b.customer.name}</span>
                <BookingBadge state={b.state} />
              </div>
              <p className="text-sm text-slate-600">
                {b.rideDetails?.pickupAddress} → {b.rideDetails?.dropoffAddress}
              </p>
            </Link>
          ))
        ) : (
          <p className="text-sm text-slate-500">No active job.</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-slate-500">Completed trips</p>
          <p className="text-2xl font-semibold">{done.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Fares (completed)</p>
          <p className="text-2xl font-semibold">{kes(done.reduce((s, b) => s + b.quote, 0))}</p>
        </div>
      </div>

      {consent && (
        <Modal title="Go online" onClose={() => setConsent(false)}>
          <p className="text-sm text-slate-600">
            Optionally show connected customers your <strong>approximate area</strong> (about 1 km
            precision) while you are online. Your precise location is never shown outside an active
            trip.
          </p>
          <div className="grid gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                setConsent(false);
                setAvail.mutate({ availability: 'ONLINE', share: true });
              }}
            >
              Go online and share approximate area
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setConsent(false);
                setAvail.mutate({ availability: 'ONLINE', share: false });
              }}
            >
              Go online without sharing
            </button>
          </div>
        </Modal>
      )}
      {respond && <RespondDialog referral={respond} onClose={() => setRespond(null)} />}
    </div>
  );
}

function RespondDialog({ referral, onClose }: { referral: IncomingReferral; onClose: () => void }) {
  const qc = useQueryClient();
  const [eta, setEta] = useState(10);
  const [quote, setQuote] = useState(referral.booking.quote);
  const m = useMutation({
    mutationFn: (accept: boolean) =>
      post(
        `/referrals/${referral.id}/respond`,
        accept
          ? {
              accept: true,
              etaMinutes: eta,
              revisedQuote: quote !== referral.booking.quote ? quote : undefined,
            }
          : { accept: false },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrals'] });
      onClose();
    },
  });
  return (
    <Modal title="Referred ride" onClose={onClose}>
      <p className="text-sm text-slate-600">
        If you accept, the customer will see your name, vehicle, arrival time and fare, and must
        approve before you are assigned.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">ETA (minutes)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={240}
            value={eta}
            onChange={(e) => setEta(+e.target.value || 1)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Fare (KES)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={quote}
            onChange={(e) => setQuote(+e.target.value || 1)}
          />
        </label>
      </div>
      <ErrorBox error={m.error} />
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={m.isPending}
          onClick={() => m.mutate(true)}
        >
          Accept
        </button>
        <button
          className="btn-secondary flex-1"
          disabled={m.isPending}
          onClick={() => m.mutate(false)}
        >
          Decline
        </button>
      </div>
    </Modal>
  );
}

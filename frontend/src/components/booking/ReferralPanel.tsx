import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '../../lib/api';
import type { Booking, Referral } from '../../lib/types';
import { ErrorBox, kes, ReferralBadge, vehicleLine, when } from '../ui';

/**
 * Customer-facing referral consent. The new driver is assigned ONLY after the customer approves here.
 */
export function CustomerReferralPanel({
  booking,
  referral,
}: {
  booking: Booking;
  referral: Referral;
}) {
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: (approve: boolean) => post(`/referrals/${referral.id}/decision`, { approve }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', booking.id] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
  const c = referral.candidate;
  const v = c?.driverProfile?.vehicles?.[0];
  const price = referral.revisedQuote ?? booking.quote;

  if (referral.state === 'PROPOSED') {
    return (
      <section className="card space-y-1 border-amber-300 bg-amber-50">
        <h2 className="font-semibold">Your driver suggested a replacement</h2>
        <p className="text-sm text-slate-700">
          {c?.name} has been asked. We’ll ask for your approval once they accept (expires{' '}
          {when(referral.expiresAt)}).
        </p>
      </section>
    );
  }
  if (referral.state !== 'CANDIDATE_ACCEPTED') return null;

  return (
    <section className="card space-y-3 border-brand-500">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Approve replacement driver?</h2>
        <ReferralBadge state={referral.state} />
      </div>
      <p className="text-sm text-slate-600">
        Your driver is unavailable and suggests the following verified colleague. Nothing changes
        until you approve.
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Driver</dt>
          <dd className="font-medium">
            {c?.name} <span className="text-emerald-700">✓ verified</span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Vehicle</dt>
          <dd>{vehicleLine(v)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Estimated arrival</dt>
          <dd>{referral.etaMinutes ? `${referral.etaMinutes} min` : 'Not provided'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Fare</dt>
          <dd>
            {kes(price)}{' '}
            {referral.revisedQuote && referral.revisedQuote !== booking.quote && (
              <span className="text-xs text-amber-700">(was {kes(booking.quote)})</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">Offer expires {when(referral.expiresAt)}.</p>
      <ErrorBox error={decide.error} />
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={decide.isPending}
          onClick={() => decide.mutate(true)}
        >
          Approve driver
        </button>
        <button
          className="btn-secondary flex-1"
          disabled={decide.isPending}
          onClick={() => decide.mutate(false)}
        >
          Decline
        </button>
      </div>
    </section>
  );
}

import { ReactNode, useEffect } from 'react';
import type { BookingState, ReferralState } from '../lib/types';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {msg}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const tone: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800',
  slate: 'bg-slate-100 text-slate-700',
};

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: keyof typeof tone }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[color]}`}>{children}</span>;
}

const bookingColor: Record<BookingState, keyof typeof tone> = {
  DRAFT: 'slate', REQUESTED: 'amber', ACCEPTED: 'blue', EN_ROUTE: 'blue', ARRIVED: 'blue',
  IN_PROGRESS: 'blue', COMPLETED: 'green', DECLINED: 'red', CANCELLED: 'red', EXPIRED: 'slate',
};
export function BookingBadge({ state }: { state: BookingState }) {
  return <Badge color={bookingColor[state]}>{state.replace('_', ' ')}</Badge>;
}

const refColor: Record<ReferralState, keyof typeof tone> = {
  PROPOSED: 'amber', CANDIDATE_ACCEPTED: 'blue', CUSTOMER_APPROVED: 'green', CANDIDATE_DECLINED: 'red',
  CUSTOMER_REJECTED: 'red', EXPIRED: 'slate', CANCELLED: 'slate',
};
export function ReferralBadge({ state }: { state: ReferralState }) {
  return <Badge color={refColor[state]}>{state.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

export function vehicleLine(v?: { make: string; model: string; color: string; plate: string }) {
  return v ? `${v.color} ${v.make} ${v.model} · ${v.plate}` : 'No vehicle on file';
}

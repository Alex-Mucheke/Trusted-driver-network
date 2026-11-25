import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '../../lib/api';
import {
  Badge,
  BookingBadge,
  Empty,
  ErrorBox,
  ReferralBadge,
  Spinner,
  kes,
  when,
} from '../../components/ui';
import type { BookingState, ReferralState } from '../../lib/types';

type Tab =
  | 'overview'
  | 'verification'
  | 'users'
  | 'bookings'
  | 'referrals'
  | 'reports'
  | 'privacy'
  | 'audit';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['verification', 'Verification'],
  ['users', 'Users'],
  ['bookings', 'Bookings'],
  ['referrals', 'Referrals'],
  ['reports', 'Reports'],
  ['privacy', 'Privacy requests'],
  ['audit', 'Audit log'],
];

export default function AdminConsole() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Admin console</h1>
      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-brand-100 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'verification' && <Verification />}
      {tab === 'users' && <Users />}
      {tab === 'bookings' && <Bookings />}
      {tab === 'referrals' && <Referrals />}
      {tab === 'reports' && <Reports />}
      {tab === 'privacy' && <PrivacyRequests />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

function Overview() {
  const q = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => get<Record<string, number | null>>('/admin/stats'),
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <ErrorBox error={q.error} />;
  const s = q.data;
  const pct = (n: number | null) => (n == null ? '–' : `${Math.round(n * 100)}%`);
  const tiles: [string, string | number][] = [
    ['Verified drivers', s.verifiedDrivers ?? 0],
    ['Pending verification', s.pendingDrivers ?? 0],
    ['Customers', s.customers ?? 0],
    ['Bookings', s.bookings ?? 0],
    ['Completion rate', pct(s.completionRate)],
    ['Referral success', pct(s.referralSuccessRate)],
    ['Open reports', s.openReports ?? 0],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map(([l, v]) => (
        <div key={l} className="card">
          <p className="text-xs text-slate-500">{l}</p>
          <p className="text-2xl font-semibold">{v}</p>
        </div>
      ))}
    </div>
  );
}

interface QueueItem {
  userId: string;
  user: { name: string; email: string; phone: string };
  vehicles: { id: string; plate: string; make: string; model: string; active: boolean }[];
  documents: { id: string; kind: string; storageKey: string }[];
}

function Verification() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'verification'],
    queryFn: () => get<QueueItem[]>('/admin/verification'),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      post(`/admin/verification/${v.id}`, { decision: v.decision, note: v.note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  if (q.isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <ErrorBox error={q.error ?? decide.error} />
      {q.data?.length ? (
        q.data.map((d) => (
          <div key={d.userId} className="card space-y-2">
            <p className="font-medium">
              {d.user.name}{' '}
              <span className="text-sm font-normal text-slate-500">
                {d.user.email} · {d.user.phone}
              </span>
            </p>
            <p className="text-sm">
              Vehicles:{' '}
              {d.vehicles
                .filter((v) => v.active)
                .map((v) => `${v.make} ${v.model} (${v.plate})`)
                .join(', ') || 'none'}
            </p>
            <ul className="text-sm text-slate-600">
              {d.documents.map((x) => (
                <li key={x.id}>
                  {x.kind.replace(/_/g, ' ').toLowerCase()} ·{' '}
                  <span className="font-mono text-xs">{x.storageKey}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: d.userId, decision: 'APPROVED' })}
              >
                Approve
              </button>
              <button
                className="btn-danger"
                disabled={decide.isPending}
                onClick={() => {
                  const note = prompt('Reason for rejection');
                  if (note) decide.mutate({ id: d.userId, decision: 'REJECTED', note });
                }}
              >
                Reject
              </button>
            </div>
          </div>
        ))
      ) : (
        <Empty title="Verification queue is empty" />
      )}
    </div>
  );
}

interface U {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  status: 'ACTIVE' | 'SUSPENDED';
  deletedAt: string | null;
}
function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => get<U[]>(`/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });
  const set = useMutation({
    mutationFn: (v: { id: string; status: 'ACTIVE' | 'SUSPENDED'; reason?: string }) =>
      patch(`/admin/users/${v.id}/status`, { status: v.status, reason: v.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
  const erase = useMutation({
    mutationFn: (id: string) => post(`/admin/users/${id}/erase`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="Search name, email or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorBox error={q.error ?? set.error ?? erase.error} />
      {q.isLoading ? (
        <Spinner />
      ) : (
        <ul className="space-y-2">
          {q.data?.map((u) => (
            <li key={u.id} className="card flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {u.name} <Badge>{u.roles.join(', ').toLowerCase()}</Badge>
                </p>
                <p className="text-xs text-slate-500">
                  {u.email} · {u.phone}
                </p>
              </div>
              {u.deletedAt ? (
                <Badge>erased</Badge>
              ) : (
                <div className="flex gap-2">
                  {u.status === 'ACTIVE' ? (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        const reason = prompt('Reason for suspension');
                        if (reason) set.mutate({ id: u.id, status: 'SUSPENDED', reason });
                      }}
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      onClick={() => set.mutate({ id: u.id, status: 'ACTIVE' })}
                    >
                      Reinstate
                    </button>
                  )}
                  {!u.roles.includes('ADMIN') && (
                    <button
                      className="btn-danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Permanently erase ${u.name}? Personal data is anonymised and this cannot be undone.`,
                          )
                        ) {
                          erase.mutate(u.id);
                        }
                      }}
                    >
                      Erase
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface B {
  id: string;
  state: BookingState;
  quote: number;
  createdAt: string;
  customer: { name: string };
  requestedDriver: { name: string };
  assignedDriver: { name: string } | null;
  rideDetails?: { pickupAddress: string; dropoffAddress: string } | null;
}
function Bookings() {
  const q = useQuery({
    queryKey: ['admin', 'bookings'],
    queryFn: () => get<B[]>('/admin/bookings'),
  });
  const [open, setOpen] = useState<string | null>(null);
  const ev = useQuery({
    queryKey: ['admin', 'events', open],
    enabled: !!open,
    queryFn: () =>
      get<{ id: string; type: string; createdAt: string }[]>(`/admin/bookings/${open}/events`),
  });
  if (q.isLoading) return <Spinner />;
  return (
    <ul className="space-y-2">
      <ErrorBox error={q.error} />
      {q.data?.map((b) => (
        <li key={b.id} className="card space-y-1">
          <button className="w-full text-left" onClick={() => setOpen(open === b.id ? null : b.id)}>
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {b.customer.name} → {(b.assignedDriver ?? b.requestedDriver).name}
              </span>
              <BookingBadge state={b.state} />
            </div>
            <p className="text-xs text-slate-500">
              {b.rideDetails?.pickupAddress} → {b.rideDetails?.dropoffAddress} · {kes(b.quote)} ·{' '}
              {when(b.createdAt)}
            </p>
          </button>
          {open === b.id && (
            <ul className="border-t pt-2 text-xs text-slate-600">
              {ev.data?.map((e) => (
                <li key={e.id}>
                  {when(e.createdAt)} · {e.type.replace(/_/g, ' ').toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Referrals() {
  const q = useQuery({
    queryKey: ['admin', 'referrals'],
    queryFn: () =>
      get<
        {
          id: string;
          state: ReferralState;
          createdAt: string;
          proposer: { name: string };
          candidate: { name: string };
        }[]
      >('/admin/referrals'),
  });
  if (q.isLoading) return <Spinner />;
  return (
    <ul className="space-y-2">
      <ErrorBox error={q.error} />
      {q.data?.map((r) => (
        <li key={r.id} className="card flex items-center justify-between">
          <span className="text-sm">
            {r.proposer.name} → {r.candidate.name}{' '}
            <span className="text-xs text-slate-500">{when(r.createdAt)}</span>
          </span>
          <ReferralBadge state={r.state} />
        </li>
      ))}
      {q.data?.length === 0 && <Empty title="No referrals yet" />}
    </ul>
  );
}

interface R {
  id: string;
  type: string;
  status: string;
  category: string;
  description: string;
  createdAt: string;
  reporter: { name: string };
  target: { name: string } | null;
}
function Reports() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'reports'], queryFn: () => get<R[]>('/admin/reports') });
  const upd = useMutation({
    mutationFn: (v: { id: string; status: string; resolutionNote?: string }) =>
      patch(`/admin/reports/${v.id}`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  if (q.isLoading) return <Spinner />;
  return (
    <ul className="space-y-2">
      <ErrorBox error={q.error ?? upd.error} />
      {q.data?.map((r) => (
        <li key={r.id} className="card space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">{r.category}</span>
            <Badge
              color={r.status === 'OPEN' ? 'red' : r.status === 'RESOLVED' ? 'green' : 'amber'}
            >
              {r.status.toLowerCase()}
            </Badge>
          </div>
          <p className="text-sm">{r.description}</p>
          <p className="text-xs text-slate-500">
            By {r.reporter.name}
            {r.target ? ` about ${r.target.name}` : ''} · {when(r.createdAt)}
          </p>
          {(r.status === 'OPEN' || r.status === 'INVESTIGATING') && (
            <div className="flex gap-2 pt-1">
              {r.status === 'OPEN' && (
                <button
                  className="btn-secondary"
                  onClick={() => upd.mutate({ id: r.id, status: 'INVESTIGATING' })}
                >
                  Investigate
                </button>
              )}
              <button
                className="btn-primary"
                onClick={() => {
                  const n = prompt('Resolution note');
                  if (n) upd.mutate({ id: r.id, status: 'RESOLVED', resolutionNote: n });
                }}
              >
                Resolve
              </button>
              <button
                className="btn-secondary"
                onClick={() => upd.mutate({ id: r.id, status: 'DISMISSED' })}
              >
                Dismiss
              </button>
            </div>
          )}
        </li>
      ))}
      {q.data?.length === 0 && <Empty title="No reports" />}
    </ul>
  );
}

interface DR {
  id: string;
  type: string;
  status: 'OPEN' | 'COMPLETED' | 'REJECTED';
  note: string | null;
  resolution: string | null;
  requestedAt: string;
  dueAt: string;
  overdue: boolean;
  user: { name: string; email: string; phone: string };
}
/** Data-subject requests (access, correction, objection, restriction, erasure) and their 30-day clock. */
function PrivacyRequests() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'data-requests'],
    queryFn: () => get<DR[]>('/admin/data-requests'),
  });
  const resolve = useMutation({
    mutationFn: (v: { id: string; status: 'COMPLETED' | 'REJECTED'; resolution: string }) =>
      patch(`/admin/data-requests/${v.id}`, { status: v.status, resolution: v.resolution }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  if (q.isLoading) return <Spinner />;
  return (
    <ul className="space-y-2">
      <ErrorBox error={q.error ?? resolve.error} />
      {q.data?.map((r) => (
        <li key={r.id} className="card space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {r.type.toLowerCase()} · {r.user.name}
            </span>
            <Badge color={r.overdue ? 'red' : r.status === 'OPEN' ? 'amber' : 'green'}>
              {r.overdue ? 'overdue' : r.status.toLowerCase()}
            </Badge>
          </div>
          {r.note && <p className="text-sm">{r.note}</p>}
          <p className="text-xs text-slate-500">
            {r.user.email} · asked {when(r.requestedAt)} · due {when(r.dueAt)}
          </p>
          {r.resolution && <p className="text-xs text-slate-600">{r.resolution}</p>}
          {r.status === 'OPEN' && (
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary"
                onClick={() => {
                  const n = prompt('What was done?');
                  if (n && n.length >= 3)
                    resolve.mutate({ id: r.id, status: 'COMPLETED', resolution: n });
                }}
              >
                Complete
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  const n = prompt('Why is this being declined? (shown to the person)');
                  if (n && n.length >= 3)
                    resolve.mutate({ id: r.id, status: 'REJECTED', resolution: n });
                }}
              >
                Decline
              </button>
            </div>
          )}
        </li>
      ))}
      {q.data?.length === 0 && <Empty title="No privacy requests" />}
    </ul>
  );
}

function Audit() {
  const q = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () =>
      get<
        {
          id: string;
          action: string;
          entityType: string;
          createdAt: string;
          admin: { name: string };
        }[]
      >('/admin/audit-logs'),
  });
  if (q.isLoading) return <Spinner />;
  return (
    <ul className="space-y-1 text-sm">
      <ErrorBox error={q.error} />
      {q.data?.map((a) => (
        <li key={a.id} className="card !py-2">
          {when(a.createdAt)} · <strong>{a.admin.name}</strong> ·{' '}
          {a.action.toLowerCase().replace(/_/g, ' ')} ({a.entityType})
        </li>
      ))}
      {q.data?.length === 0 && <Empty title="No admin actions yet" />}
    </ul>
  );
}

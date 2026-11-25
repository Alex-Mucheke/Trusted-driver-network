import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api';
import { ErrorBox, Field, Spinner, when } from './ui';

interface Consents {
  currentVersion: string;
  privacyNoticeAccepted: boolean;
}
interface DataRequest {
  id: string;
  type: 'ACCESS' | 'ERASURE' | 'CORRECTION' | 'OBJECTION' | 'RESTRICTION';
  status: 'OPEN' | 'COMPLETED' | 'REJECTED';
  note: string | null;
  resolution: string | null;
  requestedAt: string;
  dueAt: string;
}

const TYPE_LABEL: Record<DataRequest['type'], string> = {
  ACCESS: 'Download my data',
  ERASURE: 'Delete my account',
  CORRECTION: 'Correct my data',
  OBJECTION: 'Object to how my data is used',
  RESTRICTION: 'Limit how my data is used',
};

/** Data-subject rights: notice acknowledgement, export, other requests and account deletion. */
export default function YourData() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const consents = useQuery({
    queryKey: ['consents'],
    queryFn: () => get<Consents>('/users/me/consents'),
  });
  const requests = useQuery({
    queryKey: ['data-requests'],
    queryFn: () => get<DataRequest[]>('/users/me/data-requests'),
  });

  const accept = useMutation({
    mutationFn: () => post('/users/me/consents'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents'] }),
  });

  const download = useMutation({
    mutationFn: async () => {
      const data = await get<unknown>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tdn-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-requests'] }),
  });

  const [type, setType] = useState<'CORRECTION' | 'OBJECTION' | 'RESTRICTION'>('CORRECTION');
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => post('/users/me/data-requests', { type, note: note || undefined }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['data-requests'] });
    },
  });

  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const erase = useMutation({
    mutationFn: () => post('/users/me/erase', { password, confirm }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
      nav('/', { replace: true });
    },
  });

  if (consents.isLoading) return <Spinner />;

  return (
    <section className="card space-y-5" aria-labelledby="your-data">
      <h2 id="your-data" className="text-lg font-semibold">
        Your data
      </h2>

      {consents.data && !consents.data.privacyNoticeAccepted && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Our privacy notice has been updated (version {consents.data.currentVersion}). Please
            read it and confirm.
          </p>
          <a className="underline" href="/privacy" target="_blank" rel="noreferrer">
            Read the privacy notice
          </a>
          <div>
            <button
              className="btn-primary"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
            >
              I have read it
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Download a copy</h3>
        <p className="text-xs text-slate-500">
          Everything we hold about you as a JSON file. Other people&apos;s contact details are not
          included.
        </p>
        <ErrorBox error={download.error} />
        <button
          className="btn-secondary"
          onClick={() => download.mutate()}
          disabled={download.isPending}
        >
          {download.isPending ? 'Preparing…' : 'Download my data'}
        </button>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <h3 className="text-sm font-medium text-slate-700">Ask us to act on your data</h3>
        <Field label="Request">
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="CORRECTION">Correct something</option>
            <option value="OBJECTION">Object to how my data is used</option>
            <option value="RESTRICTION">Limit how my data is used</option>
          </select>
        </Field>
        <Field label="Details" hint="What should we change or stop doing?">
          <textarea
            className="input min-h-20"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <ErrorBox error={send.error} />
        <button className="btn-secondary" disabled={send.isPending}>
          {send.isPending ? 'Sending…' : send.isSuccess ? 'Sent ✓' : 'Send request'}
        </button>
      </form>

      {requests.data && requests.data.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">Your requests</h3>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {requests.data.map((r) => (
              <li key={r.id} className="space-y-0.5 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{TYPE_LABEL[r.type]}</span>
                  <span className="text-xs text-slate-500">{r.status.toLowerCase()}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Asked {when(r.requestedAt)}
                  {r.status === 'OPEN' && ` · we aim to answer by ${when(r.dueAt)}`}
                </p>
                {r.resolution && <p className="text-xs text-slate-600">{r.resolution}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-medium text-red-700">Delete my account</h3>
        {!showDelete ? (
          <button className="btn-danger" onClick={() => setShowDelete(true)}>
            Delete my account…
          </button>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              erase.mutate();
            }}
          >
            <p className="text-xs text-slate-600">
              This removes your personal details and cannot be undone. Payment records and safety
              reports are kept without your name where the law or safety requires. You must finish
              or cancel any open bookings first.
            </p>
            <Field label="Your password">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Type DELETE to confirm">
              <input
                className="input"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <ErrorBox error={erase.error} />
            <div className="flex gap-2">
              <button className="btn-danger" disabled={erase.isPending || confirm !== 'DELETE'}>
                {erase.isPending ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowDelete(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '../lib/api';
import { ErrorBox, Field, Spinner } from '../components/ui';

interface Me {
  name: string;
  phone: string;
  email: string;
  notificationPrefs: { push?: boolean; sms?: boolean; email?: boolean } | null;
}

export default function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['users-me'], queryFn: () => get<Me>('/users/me') });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [prefs, setPrefs] = useState({ push: true, sms: false, email: false });

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setPhone(q.data.phone);
      setPrefs({ push: true, sms: false, email: false, ...(q.data.notificationPrefs ?? {}) });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => patch('/users/me', { name, phone, notificationPrefs: prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-me'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (q.isLoading) return <Spinner />;

  return (
    <form
      className="card space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h1 className="text-xl font-semibold">Account & privacy</h1>
      <Field label="Full name">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          required
        />
      </Field>
      <Field label="Phone">
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          pattern="\+?[0-9]{9,15}"
          required
        />
      </Field>
      <Field label="Email">
        <input className="input" value={q.data?.email ?? ''} disabled />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Notifications</legend>
        {(['push', 'sms', 'email'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs[k]}
              onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })}
            />
            {k === 'push'
              ? 'In-app / push alerts'
              : k === 'sms'
                ? 'SMS for critical events'
                : 'Email'}
          </label>
        ))}
        <p className="text-xs text-slate-500">
          SMS and email delivery are not enabled in the pilot; your preference is saved for when
          they are.
        </p>
      </fieldset>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <strong>Your location:</strong> precise GPS is only shared during an accepted, active trip
        and stops automatically when the trip ends or is cancelled. Raw coordinates are deleted
        shortly afterwards.
      </div>
      <ErrorBox error={save.error} />
      <button className="btn-primary" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved ✓' : 'Save changes'}
      </button>
    </form>
  );
}

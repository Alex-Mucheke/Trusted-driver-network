import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post, put } from '../../lib/api';
import { Badge, ErrorBox, Field, Spinner } from '../../components/ui';

interface Doc { id: string; kind: string; status: string; reviewNote: string | null }
interface Veh { id: string; plate: string; type: string; make: string; model: string; color: string; capacity: number; active: boolean }
interface Profile {
  bio: string | null; serviceArea: string | null; requireConnectionApproval: boolean;
  verificationStatus: string; verificationNote: string | null;
  vehicles: Veh[]; documents: Doc[]; services: { serviceType: string; active: boolean }[];
}

const DOC_KINDS = ['NATIONAL_ID', 'DRIVING_LICENCE', 'PSV_BADGE', 'INSURANCE', 'VEHICLE_LOGBOOK', 'VEHICLE_PHOTO', 'PROFILE_PHOTO'];
const VEHICLE_TYPES = ['SEDAN', 'HATCHBACK', 'SUV', 'VAN', 'PICKUP', 'MOTORBIKE', 'TUKTUK'];
const statusColor = (s: string) => (s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : 'amber');

export default function DriverProfilePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['driver-me'], queryFn: () => get<Profile>('/drivers/me') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['driver-me'] });

  const [bio, setBio] = useState('');
  const [area, setArea] = useState('');
  const [approval, setApproval] = useState(false);
  useEffect(() => {
    if (q.data) { setBio(q.data.bio ?? ''); setArea(q.data.serviceArea ?? ''); setApproval(q.data.requireConnectionApproval); }
  }, [q.data]);

  const save = useMutation({ mutationFn: () => put('/drivers/me', { bio, serviceArea: area, requireConnectionApproval: approval }), onSuccess: refresh });

  const [v, setV] = useState({ plate: '', type: 'SEDAN', make: '', model: '', color: '', capacity: 4 });
  const addVehicle = useMutation({ mutationFn: () => post('/drivers/me/vehicles', v), onSuccess: () => { setV({ plate: '', type: 'SEDAN', make: '', model: '', color: '', capacity: 4 }); refresh(); } });
  const removeVehicle = useMutation({ mutationFn: (id: string) => del(`/drivers/me/vehicles/${id}`), onSuccess: refresh });

  const [doc, setDoc] = useState({ kind: 'NATIONAL_ID', storageKey: '' });
  const addDoc = useMutation({ mutationFn: () => post('/drivers/me/documents', doc), onSuccess: () => { setDoc({ ...doc, storageKey: '' }); refresh(); } });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <ErrorBox error={q.error} />;
  const p = q.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My profile</h1>
        <Badge color={statusColor(p.verificationStatus)}>{p.verificationStatus.toLowerCase()}</Badge>
      </div>
      {p.verificationNote && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Reviewer note: {p.verificationNote}</p>}

      <form className="card space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-semibold">Public profile</h2>
        <Field label="About you"><textarea className="input" rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
        <Field label="Operating area"><input className="input" maxLength={120} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Chuka town and surroundings" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} /> I approve new customer connections myself</label>
        <ErrorBox error={save.error} />
        <button className="btn-primary" disabled={save.isPending}>{save.isSuccess ? 'Saved ✓' : 'Save profile'}</button>
      </form>

      <section className="card space-y-3">
        <h2 className="font-semibold">Services</h2>
        <ul className="text-sm">
          {p.services.map((s) => <li key={s.serviceType}>{s.serviceType.replace(/_/g, ' ').toLowerCase()}: {s.active ? 'active' : 'off'}</li>)}
        </ul>
        <p className="text-xs text-slate-500">Parcels, shopping and errands are coming in a later release. Rides are available now.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Vehicles</h2>
        {p.vehicles.filter((x) => x.active).map((x) => (
          <div key={x.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>{x.color} {x.make} {x.model} · <strong>{x.plate}</strong> · {x.type.toLowerCase()} · {x.capacity} seats</span>
            <button className="text-red-600 hover:underline" onClick={() => removeVehicle.mutate(x.id)}>Remove</button>
          </div>
        ))}
        <form className="grid grid-cols-2 gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); addVehicle.mutate(); }}>
          <input className="input" placeholder="Plate (KDA 123A)" required minLength={3} maxLength={12} value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} />
          <select className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <input className="input" placeholder="Make" required value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} />
          <input className="input" placeholder="Model" required value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
          <input className="input" placeholder="Colour" required value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} />
          <input className="input" type="number" min={1} max={60} value={v.capacity} onChange={(e) => setV({ ...v, capacity: +e.target.value || 1 })} aria-label="Seats" />
          <div className="col-span-2"><ErrorBox error={addVehicle.error ?? removeVehicle.error} /></div>
          <button className="btn-secondary col-span-2" disabled={addVehicle.isPending}>Add vehicle</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Verification documents</h2>
        <ul className="space-y-1 text-sm">
          {p.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between">
              <span>{d.kind.replace(/_/g, ' ').toLowerCase()}</span>
              <Badge color={statusColor(d.status)}>{d.status.toLowerCase()}</Badge>
            </li>
          ))}
          {p.documents.length === 0 && <li className="text-slate-500">No documents submitted yet.</li>}
        </ul>
        <form className="space-y-2" onSubmit={(e: FormEvent) => { e.preventDefault(); addDoc.mutate(); }}>
          <select className="input" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })}>{DOC_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ').toLowerCase()}</option>)}</select>
          <Field label="Storage key" hint="Direct file upload (private bucket + signed URLs) is wired up in the storage step; until then, enter the key of a file placed in your private bucket.">
            <input className="input" required maxLength={300} value={doc.storageKey} onChange={(e) => setDoc({ ...doc, storageKey: e.target.value })} />
          </Field>
          <ErrorBox error={addDoc.error} />
          <button className="btn-secondary" disabled={addDoc.isPending}>Submit document</button>
        </form>
      </section>
    </div>
  );
}

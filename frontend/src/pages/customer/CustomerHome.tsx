import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '../../lib/api';
import type { DriverBrief } from '../../lib/types';
import { Badge, Empty, ErrorBox, Spinner, vehicleLine } from '../../components/ui';

interface Conn { id: string; status: 'ACTIVE' | 'PENDING'; driver: DriverBrief }
interface Approx { driverId: string; availability: string; approx: { lat: number; lng: number } | null }

export default function CustomerHome() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const conns = useQuery({ queryKey: ['conns'], queryFn: () => get<Conn[]>('/connections/customer') });
  const approx = useQuery({ queryKey: ['approx'], queryFn: () => get<Approx[]>('/locations/approx'), refetchInterval: 60_000 });
  const [code, setCode] = useState('');

  const add = useMutation({
    mutationFn: (c: string) => post(`/connections/customer/connect/${c.trim().toUpperCase()}`),
    onSuccess: () => { setCode(''); qc.invalidateQueries({ queryKey: ['conns'] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/connections/customer/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conns'] }),
  });
  const block = useMutation({
    mutationFn: (id: string) => post(`/connections/customer/${id}/block`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conns'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My trusted drivers</h1>

      <form className="card flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (code) add.mutate(code); }}>
        <input className="input" placeholder="Driver code (from their link or QR)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Driver code" />
        <button className="btn-primary shrink-0" disabled={!code || add.isPending}>Add</button>
      </form>
      <ErrorBox error={add.error ?? remove.error ?? block.error} />

      {conns.isLoading ? <Spinner /> : conns.data?.length ? (
        <ul className="space-y-3">
          {conns.data.map((c) => {
            const p = c.driver.driverProfile;
            const online = approx.data?.find((a) => a.driverId === c.driver.id);
            const active = c.status === 'ACTIVE';
            return (
              <li key={c.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.driver.name}</p>
                    <p className="text-sm text-slate-500">{vehicleLine(p?.vehicles?.[0])}</p>
                    {p?.serviceArea && <p className="text-xs text-slate-400">{p.serviceArea}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {!active && <Badge color="amber">Awaiting approval</Badge>}
                    {active && <Badge color={(online?.availability ?? p?.availability) === 'ONLINE' ? 'green' : 'slate'}>{(online?.availability ?? p?.availability) === 'ONLINE' ? 'Available' : 'Offline'}</Badge>}
                    {online?.approx && <span className="text-[11px] text-slate-400">Shares approximate area</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {active && <button className="btn-primary" onClick={() => nav(`/app/request/${c.driver.id}`)}>Request a ride</button>}
                  <button className="btn-secondary" onClick={() => remove.mutate(c.driver.id)}>Disconnect</button>
                  <button className="btn-secondary" onClick={() => { if (confirm(`Block ${c.driver.name}? They will not be able to reconnect.`)) block.mutate(c.driver.id); }}>Block</button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No trusted drivers yet" hint="Ask your driver for their link or QR code, then enter the code above." />
      )}
      <p className="text-center text-sm text-slate-500"><Link className="text-brand-700 hover:underline" to="/app/bookings">View my bookings →</Link></p>
    </div>
  );
}

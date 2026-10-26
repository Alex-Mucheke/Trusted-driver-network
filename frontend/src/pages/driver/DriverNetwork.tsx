import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '../../lib/api';
import type { DriverBrief } from '../../lib/types';
import { Badge, Empty, ErrorBox, Spinner, vehicleLine } from '../../components/ui';

interface CustomerConn { id: string; status: 'ACTIVE' | 'PENDING'; customer: { id: string; name: string } }
interface Peer { id: string; trustStatus: 'PENDING' | 'TRUSTED'; requestedByMe: boolean; peer: DriverBrief }

export default function DriverNetwork() {
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['driver-customers'], queryFn: () => get<CustomerConn[]>('/connections/driver/customers') });
  const peers = useQuery({ queryKey: ['driver-peers'], queryFn: () => get<Peer[]>('/connections/drivers') });
  const [code, setCode] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['driver-customers'] }); qc.invalidateQueries({ queryKey: ['driver-peers'] }); };

  const m = useMutation({ mutationFn: (p: { method: 'post' | 'del'; path: string }) => (p.method === 'post' ? post(p.path) : del(p.path)), onSuccess: refresh });
  const addPeer = useMutation({
    mutationFn: () => post(`/connections/drivers/request/${code.trim().toUpperCase()}`),
    onSuccess: () => { setCode(''); refresh(); },
  });

  return (
    <div className="space-y-6">
      <ErrorBox error={m.error ?? addPeer.error} />

      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Trusted drivers</h1>
        <p className="text-sm text-slate-600">Colleagues you vouch for. You can refer jobs to them when you are busy, and they can refer to you. The customer always approves.</p>
        <form className="card flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (code) addPeer.mutate(); }}>
          <input className="input" placeholder="Colleague's driver code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Colleague's driver code" />
          <button className="btn-primary shrink-0" disabled={!code || addPeer.isPending}>Send request</button>
        </form>
        {peers.isLoading ? <Spinner /> : peers.data?.length ? (
          <ul className="space-y-2">
            {peers.data.map((l) => (
              <li key={l.id} className="card flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{l.peer.name}</p>
                  <p className="text-xs text-slate-500">{vehicleLine(l.peer.driverProfile?.vehicles?.[0])}</p>
                </div>
                <div className="flex items-center gap-2">
                  {l.trustStatus === 'TRUSTED' ? <Badge color="green">Trusted</Badge> : l.requestedByMe ? <Badge color="amber">Request sent</Badge> : (
                    <button className="btn-primary" onClick={() => m.mutate({ method: 'post', path: `/connections/drivers/${l.peer.id}/accept` })}>Accept</button>
                  )}
                  <button className="btn-secondary" onClick={() => m.mutate({ method: 'del', path: `/connections/drivers/${l.peer.id}` })}>{l.trustStatus === 'TRUSTED' ? 'Remove' : 'Cancel'}</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No trusted colleagues yet" hint="Ask a driver you trust for their code (Share tab)." />}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">My customers</h2>
        {customers.isLoading ? <Spinner /> : customers.data?.length ? (
          <ul className="space-y-2">
            {customers.data.map((c) => (
              <li key={c.id} className="card flex items-center justify-between gap-2">
                <span className="font-medium">{c.customer.name}</span>
                <div className="flex items-center gap-2">
                  {c.status === 'PENDING' ? (
                    <>
                      <button className="btn-primary" onClick={() => m.mutate({ method: 'post', path: `/connections/driver/customers/${c.customer.id}/approve` })}>Approve</button>
                      <button className="btn-secondary" onClick={() => m.mutate({ method: 'post', path: `/connections/driver/customers/${c.customer.id}/reject` })}>Reject</button>
                    </>
                  ) : <Badge color="green">Connected</Badge>}
                  <button className="btn-secondary" onClick={() => { if (confirm(`Block ${c.customer.name}?`)) m.mutate({ method: 'post', path: `/connections/driver/customers/${c.customer.id}/block` }); }}>Block</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No customers yet" hint="Share your QR code or link from the Share tab." />}
      </section>
    </div>
  );
}

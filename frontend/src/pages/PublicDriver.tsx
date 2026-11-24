import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, ErrorBox, Spinner, vehicleLine } from '../components/ui';
import type { Vehicle } from '../lib/types';

interface PublicProfile {
  id: string;
  name: string;
  bio: string | null;
  serviceArea: string | null;
  availability: 'ONLINE' | 'OFFLINE';
  requireConnectionApproval: boolean;
  vehicles: Vehicle[];
  services: string[];
  rating: { average: number | null; count: number };
  shareCode: string;
}

/** Landing page for a driver's share link / QR code. */
export default function PublicDriver() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['public-driver', code],
    queryFn: () => get<PublicProfile>(`/drivers/public/${code}`),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: () => post<{ status: string }>(`/connections/customer/connect/${code}`),
    onSuccess: (c) => (c.status === 'ACTIVE' ? nav(`/app/request/${q.data!.id}`) : nav('/app')),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data)
    return (
      <div className="card text-center">
        This driver link is not valid or the driver is not verified.
      </div>
    );
  const d = q.data;
  const isCustomer = user?.roles.includes('CUSTOMER');

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{d.name}</h1>
          <p className="text-sm text-slate-500">{d.serviceArea ?? 'Service area not set'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge color="green">Verified driver</Badge>
          <Badge color={d.availability === 'ONLINE' ? 'green' : 'slate'}>
            {d.availability === 'ONLINE' ? 'Available' : 'Offline'}
          </Badge>
        </div>
      </div>
      {d.bio && <p className="text-slate-700">{d.bio}</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Vehicle</dt>
          <dd>{vehicleLine(d.vehicles[0])}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Rating</dt>
          <dd>
            {d.rating.average
              ? `${d.rating.average.toFixed(1)} ★ (${d.rating.count})`
              : 'No ratings yet'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Services</dt>
          <dd>{d.services.join(', ').replace(/_/g, ' ').toLowerCase()}</dd>
        </div>
      </dl>
      <ErrorBox error={connect.error} />
      {!user && (
        <Link className="btn-primary w-full" to={`/login?next=${encodeURIComponent(`/d/${code}`)}`}>
          Sign in to add this driver
        </Link>
      )}
      {user && isCustomer && (
        <button
          className="btn-primary w-full"
          disabled={connect.isPending}
          onClick={() => connect.mutate()}
        >
          {d.requireConnectionApproval ? 'Request to connect' : 'Add as trusted driver'}
        </button>
      )}
      {user && !isCustomer && (
        <p className="text-sm text-slate-500">
          Sign in with a customer account to connect with this driver.
        </p>
      )}
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '../../lib/api';
import type { Booking, DriverBrief } from '../../lib/types';
import { ErrorBox, Field, Spinner, vehicleLine } from '../../components/ui';
import { PlaceInput, PlaceValue } from '../../components/PlaceInput';

interface Conn {
  status: string;
  driver: DriverBrief;
}

export default function RequestRide() {
  const { driverId = '' } = useParams();
  const nav = useNavigate();
  const conns = useQuery({
    queryKey: ['conns'],
    queryFn: () => get<Conn[]>('/connections/customer'),
  });
  const [pickup, setPickup] = useState<PlaceValue>({ address: '', lat: null, lng: null });
  const [dropoff, setDropoff] = useState<PlaceValue>({ address: '', lat: null, lng: null });
  const [passengers, setPassengers] = useState(1);
  const [scheduled, setScheduled] = useState('');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () =>
      post<Booking>('/bookings', {
        driverId,
        type: 'RIDE',
        pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
        dropoff: { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng },
        passengerCount: passengers,
        scheduledAt: scheduled ? new Date(scheduled).toISOString() : undefined,
        notes: notes || undefined,
      }),
    onSuccess: (b) => nav(`/bookings/${b.id}`),
  });

  if (conns.isLoading) return <Spinner />;
  const conn = conns.data?.find((c) => c.driver.id === driverId && c.status === 'ACTIVE');
  if (!conn)
    return (
      <div className="card">
        You are not connected to this driver. Add them from “My drivers” first.
      </div>
    );

  const ready = pickup.lat != null && dropoff.lat != null && pickup.address && dropoff.address;

  return (
    <form
      className="card space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ready) create.mutate();
      }}
    >
      <div>
        <h1 className="text-xl font-semibold">Request a ride</h1>
        <p className="text-sm text-slate-500">
          with {conn.driver.name} · {vehicleLine(conn.driver.driverProfile?.vehicles?.[0])}
        </p>
      </div>
      <PlaceInput label="Pickup" value={pickup} onChange={setPickup} allowLocate />
      <PlaceInput label="Destination" value={dropoff} onChange={setDropoff} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Passengers">
          <input
            className="input"
            type="number"
            min={1}
            max={12}
            value={passengers}
            onChange={(e) => setPassengers(+e.target.value || 1)}
          />
        </Field>
        <Field label="When" hint="Leave empty for now">
          <input
            className="input"
            type="datetime-local"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notes for the driver (optional)">
        <input
          className="input"
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        You will see an estimated fare once you send the request. If your driver is busy they may
        suggest a verified colleague. You decide whether to accept the replacement.
      </p>
      <ErrorBox error={create.error} />
      <button className="btn-primary w-full" disabled={!ready || create.isPending}>
        {create.isPending ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}

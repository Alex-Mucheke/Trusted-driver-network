import { useEffect, useState } from 'react';
import { get } from '../../lib/api';
import { useSocket } from '../../lib/realtime';
import { when } from '../ui';

interface Fix {
  bookingId: string;
  lat: number;
  lng: number;
  capturedAt: string;
}

const MAPS_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_KEY;

/**
 * Customer view of the driver's live position. Authorised per booking on the server.
 * Falls back to polling when the socket drops (poor mobile connectivity).
 */
export function LiveTracking({ bookingId }: { bookingId: string }) {
  const socket = useSocket();
  const [fix, setFix] = useState<Fix | null>(null);
  const [denied, setDenied] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (f: Fix) => f.bookingId === bookingId && (setFix(f), setStale(false));
    socket.on('location:update', onUpdate);
    const subscribe = () =>
      socket.emit(
        'location:subscribe',
        { bookingId },
        (res: { ok: boolean; latest?: Fix | null }) => {
          if (!res?.ok) return setDenied(true);
          if (res.latest) setFix(res.latest);
        },
      );
    if (socket.connected) subscribe();
    socket.on('connect', subscribe); // re-subscribe after reconnects
    return () => {
      socket.off('location:update', onUpdate);
      socket.off('connect', subscribe);
    };
  }, [socket, bookingId]);

  // Polling fallback + staleness indicator.
  useEffect(() => {
    const t = setInterval(async () => {
      if (socket?.connected && fix && Date.now() - new Date(fix.capturedAt).getTime() < 20_000)
        return;
      try {
        const latest = await get<Fix | null>(`/locations/booking/${bookingId}/latest`);
        if (latest) setFix(latest);
      } catch {
        /* not authorised or offline */
      }
      setStale(!!fix && Date.now() - new Date(fix.capturedAt).getTime() > 45_000);
    }, 15_000);
    return () => clearInterval(t);
  }, [socket, bookingId, fix]);

  if (denied) return null;

  return (
    <section className="card space-y-2" aria-live="polite">
      <h2 className="font-semibold">Live tracking</h2>
      {!fix ? (
        <p className="text-sm text-slate-500">
          Waiting for the driver to share their location… If this takes long, call or message your
          driver.
        </p>
      ) : (
        <>
          {MAPS_KEY ? (
            <iframe
              title="Driver location"
              className="h-56 w-full rounded-lg border"
              loading="lazy"
              src={`https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${fix.lat},${fix.lng}&zoom=15`}
            />
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 font-mono text-xs">
              {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Updated {when(fix.capturedAt)}{' '}
            {stale && <span className="text-amber-700">· signal may be weak</span>}
          </p>
          <a
            className="btn-secondary w-full"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps?q=${fix.lat},${fix.lng}`}
          >
            Open in Maps
          </a>
        </>
      )}
      <p className="text-xs text-slate-400">Tracking stops automatically when the trip ends.</p>
    </section>
  );
}

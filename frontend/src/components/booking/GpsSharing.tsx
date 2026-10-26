import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../../lib/realtime';
import { Modal } from '../ui';

/**
 * Driver-side location sharing for ONE active booking, behind an explicit consent dialog.
 * Note: a PWA can only report while the screen is on / the app is foregrounded on many phones.
 */
export function GpsSharing({ bookingId }: { bookingId: string }) {
  const socket = useSocket();
  const [asking, setAsking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [msg, setMsg] = useState('');
  const watch = useRef<number | null>(null);

  function stop() {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setSharing(false);
  }

  function start() {
    setAsking(false);
    if (!navigator.geolocation) return setMsg('Location is not supported on this device. Share your position by phone instead.');
    setMsg('');
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        socket?.emit(
          'location:update',
          { bookingId, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() },
          (res: { ok: boolean; error?: string }) => {
            if (res && !res.ok) { setMsg(res.error ?? 'Location rejected'); stop(); }
          },
        );
      },
      (err) => {
        setMsg(err.code === err.PERMISSION_DENIED ? 'Location permission denied. The customer can still reach you by phone.' : 'GPS signal lost. Retrying…');
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    setSharing(true);
  }

  // Always stop when leaving the screen / the booking ends.
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Share my location</h2>
      <p className="text-sm text-slate-600">Only this customer can see your position, only for this trip.</p>
      {sharing ? (
        <button className="btn-secondary" onClick={stop}>Stop sharing</button>
      ) : (
        <button className="btn-primary" onClick={() => setAsking(true)}>Start sharing</button>
      )}
      {sharing && <p className="text-xs text-emerald-700">● Sharing live location</p>}
      {msg && <p className="text-xs text-amber-700">{msg}</p>}
      {asking && (
        <Modal title="Share your live location?" onClose={() => setAsking(false)}>
          <p className="text-sm text-slate-600">
            Your precise position will be sent to this customer while the trip is active. It stops automatically when the trip is completed or cancelled, and raw coordinates are deleted shortly after.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAsking(false)}>Cancel</button>
            <button className="btn-primary" onClick={start}>Share</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

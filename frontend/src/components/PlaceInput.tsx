import { useState } from 'react';
import { Modal } from './ui';

export interface PlaceValue {
  address: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Address + coordinates. Geocoding (Google Maps / Mapbox) plugs in here later; for now a customer can
 * use their current location (with an explicit consent dialog) or paste "lat, lng" from any map app.
 */
export function PlaceInput({
  label,
  value,
  onChange,
  allowLocate = false,
}: {
  label: string;
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  allowLocate?: boolean;
}) {
  const [coords, setCoords] = useState(value.lat != null ? `${value.lat}, ${value.lng}` : '');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');

  function parse(text: string) {
    setCoords(text);
    const m = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180)
      onChange({ ...value, lat: +m[1], lng: +m[2] });
    else onChange({ ...value, lat: null, lng: null });
  }

  function locate() {
    setConsent(false);
    setErr('');
    if (!navigator.geolocation) return setErr('Location is not supported on this device.');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = +p.coords.latitude.toFixed(6);
        const lng = +p.coords.longitude.toFixed(6);
        setCoords(`${lat}, ${lng}`);
        onChange({ address: value.address || 'My current location', lat, lng });
      },
      () => setErr('Could not get your location. Enter the coordinates manually.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <input
        className="input"
        placeholder="Address or landmark"
        value={value.address}
        required
        maxLength={200}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
      />
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Coordinates: -0.3300, 37.6500"
          value={coords}
          onChange={(e) => parse(e.target.value)}
          aria-label={`${label} coordinates`}
        />
        {allowLocate && (
          <button type="button" className="btn-secondary shrink-0" onClick={() => setConsent(true)}>
            Use my location
          </button>
        )}
      </div>
      {value.lat == null && coords && (
        <p className="text-xs text-red-600">Enter coordinates as “latitude, longitude”.</p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {consent && (
        <Modal title="Use your current location?" onClose={() => setConsent(false)}>
          <p className="text-sm text-slate-600">
            Your device location is used once, to fill in this pickup point. It is not tracked or
            shared with drivers until a driver accepts your trip.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConsent(false)}>
              Not now
            </button>
            <button className="btn-primary" onClick={locate}>
              Allow once
            </button>
          </div>
        </Modal>
      )}
    </fieldset>
  );
}

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Server-side indicative fare in whole KES. Real-road distance is ~1.3x the straight line. */
export function estimateFare(distanceKm: number): number {
  const base = Number(process.env.BASE_FARE_KES ?? 100);
  const perKm = Number(process.env.PER_KM_KES ?? 50);
  const roadKm = distanceKm * 1.3;
  return Math.max(base, Math.round((base + roadKm * perKm) / 10) * 10);
}

/** Rounds to 2 decimals (~1.1 km) so only an approximate area is ever exposed. */
export function approximate(n: number): number {
  return Math.round(n * 100) / 100;
}

export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

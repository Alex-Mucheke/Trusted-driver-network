"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineKm = haversineKm;
exports.estimateFare = estimateFare;
exports.approximate = approximate;
exports.orderPair = orderPair;
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function estimateFare(distanceKm) {
    const base = Number(process.env.BASE_FARE_KES ?? 100);
    const perKm = Number(process.env.PER_KM_KES ?? 50);
    const roadKm = distanceKm * 1.3;
    return Math.max(base, Math.round((base + roadKm * perKm) / 10) * 10);
}
function approximate(n) {
    return Math.round(n * 100) / 100;
}
function orderPair(a, b) {
    return a < b ? [a, b] : [b, a];
}
//# sourceMappingURL=geo.js.map
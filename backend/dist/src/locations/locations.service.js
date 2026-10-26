"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const booking_state_1 = require("../bookings/booking-state");
const prisma_service_1 = require("../prisma/prisma.service");
const MAX_STALE_MS = 60_000;
let LocationsService = class LocationsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.lastSeen = new Map();
    }
    get minInterval() {
        return Number(process.env.LOCATION_MIN_INTERVAL_MS ?? 2000);
    }
    async ingest(driverId, body) {
        const { bookingId, lat, lng } = body ?? {};
        if (typeof bookingId !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            throw new common_1.BadRequestException('Invalid location payload');
        }
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId, assignedDriverId: driverId, state: { in: booking_state_1.ACTIVE_JOB_STATES } },
            select: { id: true, customerId: true },
        });
        if (!booking)
            throw new common_1.ForbiddenException('No active booking for location sharing');
        const now = Date.now();
        const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date(now);
        if (Number.isNaN(capturedAt.getTime()) || now - capturedAt.getTime() > MAX_STALE_MS)
            return null;
        const last = this.lastSeen.get(driverId) ?? 0;
        if (now - last < this.minInterval)
            return null;
        this.lastSeen.set(driverId, now);
        const retentionMs = Number(process.env.LOCATION_RETENTION_MINUTES ?? 60) * 60_000;
        await this.prisma.driverLocation.create({
            data: {
                driverId, bookingId, lat, lng,
                accuracy: typeof body.accuracy === 'number' ? body.accuracy : null,
                capturedAt,
                expiresAt: new Date(now + retentionMs),
            },
        });
        return {
            customerId: booking.customerId,
            payload: { bookingId, lat, lng, accuracy: body.accuracy ?? null, capturedAt: capturedAt.toISOString() },
        };
    }
    async authorizeSubscription(userId, bookingId) {
        const b = await this.prisma.booking.findFirst({
            where: { id: bookingId, customerId: userId, state: { in: booking_state_1.ACTIVE_JOB_STATES } },
            select: { id: true },
        });
        if (!b)
            throw new common_1.ForbiddenException();
        return b;
    }
    async latestForBooking(userId, bookingId) {
        await this.authorizeSubscription(userId, bookingId);
        const l = await this.prisma.driverLocation.findFirst({
            where: { bookingId, expiresAt: { gt: new Date() } },
            orderBy: { capturedAt: 'desc' },
            select: { lat: true, lng: true, accuracy: true, capturedAt: true },
        });
        return l ? { bookingId, ...l } : null;
    }
    async approximateForCustomer(customerId) {
        const conns = await this.prisma.customerDriverConnection.findMany({
            where: { customerId, status: 'ACTIVE' },
            select: {
                driver: {
                    select: {
                        id: true, name: true,
                        driverProfile: { select: { availability: true, shareApproxLocation: true, approxLat: true, approxLng: true, approxUpdatedAt: true, serviceArea: true } },
                    },
                },
            },
        });
        return conns.map(({ driver }) => {
            const p = driver.driverProfile;
            const share = !!p?.shareApproxLocation && p.availability === 'ONLINE';
            return {
                driverId: driver.id,
                name: driver.name,
                availability: p?.availability ?? 'OFFLINE',
                serviceArea: p?.serviceArea ?? null,
                approx: share && p?.approxLat != null ? { lat: p.approxLat, lng: p.approxLng, updatedAt: p.approxUpdatedAt } : null,
            };
        });
    }
    async purgeExpired() {
        await this.prisma.driverLocation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        const cutoff = Date.now() - 10 * 60_000;
        for (const [k, v] of this.lastSeen)
            if (v < cutoff)
                this.lastSeen.delete(k);
    }
};
exports.LocationsService = LocationsService;
__decorate([
    (0, schedule_1.Interval)(5 * 60_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LocationsService.prototype, "purgeExpired", null);
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LocationsService);
//# sourceMappingURL=locations.service.js.map
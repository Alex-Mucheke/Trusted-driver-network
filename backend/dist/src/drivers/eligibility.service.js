"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EligibilityService = void 0;
const common_1 = require("@nestjs/common");
const booking_state_1 = require("../bookings/booking-state");
const OVERLAP_WINDOW_MS = 90 * 60 * 1000;
let EligibilityService = class EligibilityService {
    async assertEligible(client, driverId, type, scheduledAt) {
        const profile = await client.driverProfile.findUnique({
            where: { userId: driverId },
            include: {
                user: { select: { status: true } },
                services: true,
                vehicles: { where: { active: true }, take: 1 },
            },
        });
        if (!profile || profile.verificationStatus !== 'APPROVED' || profile.user.status !== 'ACTIVE') {
            throw new common_1.ForbiddenException('Driver is not verified');
        }
        if (!scheduledAt && profile.availability !== 'ONLINE') {
            throw new common_1.ConflictException('Driver is not available right now');
        }
        if (!profile.services.some((s) => s.serviceType === type && s.active)) {
            throw new common_1.BadRequestException('Driver does not offer this service');
        }
        if (profile.vehicles.length === 0) {
            throw new common_1.BadRequestException('Driver has no active vehicle');
        }
        const t = (scheduledAt ?? new Date()).getTime();
        const now = Date.now();
        const jobs = await client.booking.findMany({
            where: { assignedDriverId: driverId, state: { in: booking_state_1.ACTIVE_JOB_STATES } },
            select: { scheduledAt: true },
        });
        const busy = jobs.some((j) => j.scheduledAt ? Math.abs(j.scheduledAt.getTime() - t) < OVERLAP_WINDOW_MS : t - now < OVERLAP_WINDOW_MS);
        if (busy)
            throw new common_1.ConflictException('Driver is already on another job');
    }
    async isEligible(client, driverId, type, scheduledAt) {
        try {
            await this.assertEligible(client, driverId, type, scheduledAt);
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.EligibilityService = EligibilityService;
exports.EligibilityService = EligibilityService = __decorate([
    (0, common_1.Injectable)()
], EligibilityService);
//# sourceMappingURL=eligibility.service.js.map
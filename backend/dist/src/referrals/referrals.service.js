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
exports.ReferralsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const client_1 = require("@prisma/client");
const bookings_service_1 = require("../bookings/bookings.service");
const geo_1 = require("../common/geo");
const eligibility_service_1 = require("../drivers/eligibility.service");
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
const OPEN = ['PROPOSED', 'CANDIDATE_ACCEPTED'];
const ttlMs = () => Number(process.env.REFERRAL_TTL_MINUTES ?? 10) * 60 * 1000;
const maxAttempts = () => Number(process.env.MAX_REFERRAL_ATTEMPTS ?? 3);
const driverPublic = {
    select: {
        id: true,
        name: true,
        driverProfile: {
            select: {
                photoUrl: true, verificationStatus: true,
                vehicles: { where: { active: true }, select: { plate: true, type: true, make: true, model: true, color: true, capacity: true } },
            },
        },
    },
};
let ReferralsService = class ReferralsService {
    constructor(prisma, bookings, eligibility, notifications) {
        this.prisma = prisma;
        this.bookings = bookings;
        this.eligibility = eligibility;
        this.notifications = notifications;
    }
    async trustedLink(a, b) {
        const [x, y] = (0, geo_1.orderPair)(a, b);
        const link = await this.prisma.driverConnection.findUnique({ where: { driverAId_driverBId: { driverAId: x, driverBId: y } } });
        return link?.trustStatus === 'TRUSTED';
    }
    async propose(driverId, bookingId, candidateId) {
        await this.expireDue(bookingId);
        const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking)
            throw new common_1.NotFoundException('Booking not found');
        if (booking.requestedDriverId !== driverId)
            throw new common_1.ForbiddenException('Only the requested driver can refer this job');
        if (booking.state !== 'REQUESTED' || booking.assignedDriverId) {
            throw new common_1.BadRequestException('Only unassigned, pending requests can be referred');
        }
        if (candidateId === driverId || candidateId === booking.customerId)
            throw new common_1.BadRequestException('Invalid candidate');
        if ((await this.prisma.referral.count({ where: { bookingId } })) >= maxAttempts()) {
            throw new common_1.BadRequestException('Maximum number of referral attempts reached for this booking');
        }
        const open = await this.prisma.referral.findFirst({ where: { bookingId, state: { in: [...OPEN] } } });
        if (open)
            throw new common_1.ConflictException('There is already an open referral for this booking');
        if (!(await this.trustedLink(driverId, candidateId))) {
            throw new common_1.ForbiddenException('You can only refer to drivers in your trusted network');
        }
        const blocked = await this.prisma.customerDriverConnection.findUnique({
            where: { customerId_driverId: { customerId: booking.customerId, driverId: candidateId } },
        });
        if (blocked?.status === 'BLOCKED')
            throw new common_1.ForbiddenException('This driver cannot be offered to the customer');
        await this.eligibility.assertEligible(this.prisma, candidateId, booking.type, booking.scheduledAt);
        try {
            const ref = await this.prisma.$transaction(async (tx) => {
                const r = await tx.referral.create({
                    data: { bookingId, proposerId: driverId, candidateId, expiresAt: new Date(Date.now() + ttlMs()) },
                });
                await tx.bookingEvent.create({
                    data: { bookingId, type: 'REFERRAL_PROPOSED', actorId: driverId, metadata: { referralId: r.id, candidateId } },
                });
                return r;
            });
            await this.notifications.notify(candidateId, 'REFERRAL_OFFER', 'Referred ride request', 'A colleague referred a ride to you. Respond before it expires.', { referralId: ref.id });
            return ref;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new common_1.ConflictException('This driver was already offered this booking');
            }
            throw e;
        }
    }
    async candidates(driverId, bookingId) {
        const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking || booking.requestedDriverId !== driverId)
            throw new common_1.ForbiddenException();
        const links = await this.prisma.driverConnection.findMany({
            where: { trustStatus: 'TRUSTED', OR: [{ driverAId: driverId }, { driverBId: driverId }] },
        });
        const already = new Set((await this.prisma.referral.findMany({ where: { bookingId }, select: { candidateId: true } })).map((r) => r.candidateId));
        const out = [];
        for (const l of links) {
            const peerId = l.driverAId === driverId ? l.driverBId : l.driverAId;
            if (already.has(peerId) || peerId === booking.customerId)
                continue;
            if (!(await this.eligibility.isEligible(this.prisma, peerId, booking.type, booking.scheduledAt)))
                continue;
            out.push(await this.prisma.user.findUniqueOrThrow({ where: { id: peerId }, ...driverPublic }));
        }
        return out;
    }
    incoming(candidateId) {
        return this.prisma.referral.findMany({
            where: { candidateId, state: 'PROPOSED', expiresAt: { gt: new Date() } },
            include: {
                proposer: { select: { id: true, name: true } },
                booking: { select: { id: true, quote: true, scheduledAt: true, passengerCount: true, rideDetails: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async candidateRespond(candidateId, referralId, dto) {
        const ref = await this.prisma.referral.findUnique({ where: { id: referralId }, include: { booking: true } });
        if (!ref || ref.candidateId !== candidateId)
            throw new common_1.NotFoundException('Referral not found');
        const { booking } = ref;
        if (!dto.accept) {
            const r = await this.prisma.referral.updateMany({
                where: { id: referralId, state: 'PROPOSED' },
                data: { state: 'CANDIDATE_DECLINED', candidateRespondedAt: new Date() },
            });
            if (r.count === 0)
                throw new common_1.ConflictException('This referral is no longer pending');
            await this.log(booking.id, 'REFERRAL_DECLINED', candidateId, { referralId });
            await this.notifications.notify(ref.proposerId, 'REFERRAL_DECLINED', 'Referral declined', 'Your colleague declined. You can try another driver.', { bookingId: booking.id });
            return { ok: true };
        }
        if (booking.state !== 'REQUESTED' || booking.assignedDriverId)
            throw new common_1.ConflictException('This booking is no longer available');
        await this.eligibility.assertEligible(this.prisma, candidateId, booking.type, booking.scheduledAt);
        let revisedQuote;
        if (dto.revisedQuote && dto.revisedQuote !== booking.quote) {
            const max = Math.round(booking.quote * Number(process.env.MAX_QUOTE_MULTIPLIER ?? 1.5));
            const min = Math.round(booking.quote * 0.5);
            if (dto.revisedQuote > max || dto.revisedQuote < min) {
                throw new common_1.BadRequestException(`Revised quote must be between KES ${min} and KES ${max}`);
            }
            revisedQuote = dto.revisedQuote;
        }
        const r = await this.prisma.referral.updateMany({
            where: { id: referralId, state: 'PROPOSED', expiresAt: { gt: new Date() } },
            data: {
                state: 'CANDIDATE_ACCEPTED',
                candidateRespondedAt: new Date(),
                etaMinutes: dto.etaMinutes,
                revisedQuote,
                expiresAt: new Date(Date.now() + ttlMs()),
            },
        });
        if (r.count === 0)
            throw new common_1.ConflictException('This referral is no longer pending');
        await this.log(booking.id, 'REFERRAL_CANDIDATE_ACCEPTED', candidateId, { referralId, etaMinutes: dto.etaMinutes, revisedQuote });
        await this.notifications.notify(booking.customerId, 'REFERRAL_APPROVAL_NEEDED', 'Approve replacement driver', 'Your driver suggested a replacement. Review their details and approve to confirm.', { bookingId: booking.id, referralId });
        this.notifications.bookingChanged([booking.customerId, ref.proposerId, candidateId], booking.id, 'REQUESTED');
        return { ok: true };
    }
    async customerDecision(customerId, referralId, approve) {
        const ref = await this.prisma.referral.findUnique({ where: { id: referralId }, include: { booking: true } });
        if (!ref || ref.booking.customerId !== customerId)
            throw new common_1.NotFoundException('Referral not found');
        const { booking } = ref;
        if (!approve) {
            const r = await this.prisma.referral.updateMany({
                where: { id: referralId, state: 'CANDIDATE_ACCEPTED' },
                data: { state: 'CUSTOMER_REJECTED', customerRespondedAt: new Date() },
            });
            if (r.count === 0)
                throw new common_1.ConflictException('Nothing to reject');
            await this.log(booking.id, 'REFERRAL_CUSTOMER_REJECTED', customerId, { referralId });
            await this.notifications.notify(ref.proposerId, 'REFERRAL_REJECTED', 'Customer declined the replacement', 'The request is back with you.', { bookingId: booking.id });
            await this.notifications.notify(ref.candidateId, 'REFERRAL_REJECTED', 'Referral not approved', 'The customer chose not to proceed.', { bookingId: booking.id });
            return { ok: true };
        }
        await this.prisma.$transaction(async (tx) => {
            const r = await tx.referral.updateMany({
                where: { id: referralId, state: 'CANDIDATE_ACCEPTED', expiresAt: { gt: new Date() } },
                data: { state: 'CUSTOMER_APPROVED', customerRespondedAt: new Date() },
            });
            if (r.count === 0)
                throw new common_1.ConflictException('This referral is no longer awaiting your approval');
            await this.bookings.assignInTx(tx, booking.id, ref.candidateId, customerId, 'REFERRAL', { revisedQuote: ref.revisedQuote });
            await tx.bookingEvent.create({
                data: { bookingId: booking.id, type: 'REFERRAL_CUSTOMER_APPROVED', actorId: customerId, metadata: { referralId, candidateId: ref.candidateId, proposerId: ref.proposerId } },
            });
        });
        await this.bookings.afterAssigned(booking.id, customerId, ref.candidateId);
        await this.notifications.notify(ref.candidateId, 'REFERRAL_CONFIRMED', 'You have the job', 'The customer approved you. Head to the pickup point.', { bookingId: booking.id });
        await this.notifications.notify(ref.proposerId, 'REFERRAL_CONFIRMED', 'Referral confirmed', 'Your colleague was approved and assigned.', { bookingId: booking.id });
        return { ok: true };
    }
    async cancel(userId, referralId) {
        const ref = await this.prisma.referral.findUnique({ where: { id: referralId }, include: { booking: true } });
        if (!ref)
            throw new common_1.NotFoundException();
        if (userId !== ref.proposerId && userId !== ref.booking.customerId)
            throw new common_1.ForbiddenException();
        const r = await this.prisma.referral.updateMany({ where: { id: referralId, state: { in: [...OPEN] } }, data: { state: 'CANCELLED' } });
        if (r.count === 0)
            throw new common_1.ConflictException('Referral is no longer open');
        await this.log(ref.bookingId, 'REFERRAL_CANCELLED', userId, { referralId });
        return { ok: true };
    }
    async expireDue(bookingId) {
        const due = await this.prisma.referral.findMany({
            where: { state: { in: [...OPEN] }, expiresAt: { lt: new Date() }, ...(bookingId ? { bookingId } : {}) },
            include: { booking: { select: { customerId: true } } },
            take: 200,
        });
        for (const r of due) {
            const res = await this.prisma.referral.updateMany({ where: { id: r.id, state: { in: [...OPEN] } }, data: { state: 'EXPIRED' } });
            if (res.count === 0)
                continue;
            await this.log(r.bookingId, 'REFERRAL_EXPIRED', null, { referralId: r.id });
            await this.notifications.notify(r.proposerId, 'REFERRAL_EXPIRED', 'Referral expired', 'The referral timed out. The request is still with you.', { bookingId: r.bookingId });
        }
    }
    sweep() {
        return this.expireDue();
    }
    log(bookingId, type, actorId, metadata) {
        return this.prisma.bookingEvent.create({ data: { bookingId, type, actorId, metadata: metadata } });
    }
};
exports.ReferralsService = ReferralsService;
__decorate([
    (0, schedule_1.Interval)(30_000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReferralsService.prototype, "sweep", null);
exports.ReferralsService = ReferralsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bookings_service_1.BookingsService,
        eligibility_service_1.EligibilityService,
        notifications_service_1.NotificationsService])
], ReferralsService);
//# sourceMappingURL=referrals.service.js.map
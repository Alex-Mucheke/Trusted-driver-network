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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const class_validator_1 = require("class-validator");
const throttler_1 = require("@nestjs/throttler");
const decorators_1 = require("../common/decorators");
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
class CashPaymentDto {
}
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CashPaymentDto.prototype, "bookingId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100_000),
    __metadata("design:type", Number)
], CashPaymentDto.prototype, "tip", void 0);
function receiptNumber() {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `TDN-${d}-${(0, crypto_1.randomBytes)(3).toString('hex').toUpperCase()}`;
}
function safeEqual(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && (0, crypto_1.timingSafeEqual)(x, y);
}
let PaymentsController = class PaymentsController {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
    }
    async recordCash(user, dto) {
        const b = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
        if (!b)
            throw new common_1.NotFoundException('Booking not found');
        if (b.assignedDriverId !== user.id)
            throw new common_1.ForbiddenException();
        if (b.state !== 'COMPLETED')
            throw new common_1.BadRequestException('Payment can only be recorded for a completed booking');
        const tip = dto.tip ?? 0;
        try {
            const p = await this.prisma.payment.create({
                data: {
                    bookingId: b.id, method: 'CASH', state: 'PAID',
                    serviceCharge: b.quote, itemCost: 0, platformFee: 0, tip,
                    total: b.quote + tip,
                    receiptNumber: receiptNumber(), paidAt: new Date(),
                },
            });
            await this.prisma.bookingEvent.create({ data: { bookingId: b.id, type: 'PAYMENT_RECORDED', actorId: user.id, metadata: { paymentId: p.id, method: 'CASH', total: p.total } } });
            await this.notifications.notify(b.customerId, 'PAYMENT_RECORDED', 'Receipt available', `Cash payment of KES ${p.total} recorded.`, { bookingId: b.id });
            return p;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new common_1.ConflictException('A payment is already recorded for this booking');
            }
            throw e;
        }
    }
    async forBooking(user, bookingId) {
        const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
        if (!b)
            throw new common_1.NotFoundException();
        if (b.customerId !== user.id && b.assignedDriverId !== user.id)
            throw new common_1.ForbiddenException();
        return b.payment;
    }
    initiate() {
        throw new common_1.NotImplementedException('M-Pesa payments are not enabled in this release. Use cash for the pilot.');
    }
    async mpesaCallback(secret, body) {
        const expected = process.env.MPESA_CALLBACK_SECRET;
        if (!expected || !secret || !safeEqual(secret, expected))
            throw new common_1.ForbiddenException();
        const cb = body?.Body?.stkCallback;
        const ref = cb?.CheckoutRequestID;
        if (!ref)
            throw new common_1.BadRequestException('Malformed callback');
        const payment = await this.prisma.payment.findUnique({ where: { providerReference: ref } });
        if (!payment)
            return { ResultCode: 0, ResultDesc: 'Accepted' };
        const ok = cb.ResultCode === 0;
        const res = await this.prisma.payment.updateMany({
            where: { id: payment.id, state: 'PENDING' },
            data: {
                state: ok ? 'PAID' : 'FAILED',
                paidAt: ok ? new Date() : null,
                receiptNumber: ok ? receiptNumber() : null,
                rawCallback: body,
            },
        });
        if (res.count === 1) {
            await this.prisma.bookingEvent.create({
                data: { bookingId: payment.bookingId, type: ok ? 'PAYMENT_CONFIRMED' : 'PAYMENT_FAILED', actorId: null, metadata: { paymentId: payment.id, provider: 'MPESA' } },
            });
        }
        return { ResultCode: 0, ResultDesc: 'Accepted' };
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('cash'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CashPaymentDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "recordCash", null);
__decorate([
    (0, common_1.Get)('booking/:bookingId'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('bookingId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "forBooking", null);
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Post)('mpesa/initiate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "initiate", null);
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.HttpCode)(200),
    (0, common_1.Post)('mpesa/callback'),
    __param(0, (0, common_1.Headers)('x-callback-secret')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "mpesaCallback", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notifications_service_1.NotificationsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map
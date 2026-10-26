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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const decorators_1 = require("../common/decorators");
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
class VerifyDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['APPROVED', 'REJECTED']),
    __metadata("design:type", String)
], VerifyDto.prototype, "decision", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], VerifyDto.prototype, "note", void 0);
class UserStatusDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['ACTIVE', 'SUSPENDED']),
    __metadata("design:type", String)
], UserStatusDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UserStatusDto.prototype, "reason", void 0);
class ReportUpdateDto {
}
__decorate([
    (0, class_validator_1.IsEnum)(client_1.ReportStatus),
    __metadata("design:type", String)
], ReportUpdateDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ReportUpdateDto.prototype, "resolutionNote", void 0);
let AdminController = class AdminController {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
    }
    audit(adminId, action, entityType, entityId, metadata) {
        return this.prisma.adminAuditLog.create({
            data: { adminId, action, entityType, entityId, metadata: metadata },
        });
    }
    queue() {
        return this.prisma.driverProfile.findMany({
            where: { verificationStatus: 'PENDING' },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
                vehicles: true,
                documents: { orderBy: { createdAt: 'desc' } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async verify(admin, driverId, dto) {
        const p = await this.prisma.driverProfile.findUnique({ where: { userId: driverId }, include: { documents: true, vehicles: true } });
        if (!p)
            throw new common_1.NotFoundException('Driver not found');
        if (dto.decision === 'APPROVED') {
            if (p.documents.length === 0)
                throw new common_1.BadRequestException('No documents submitted');
            if (p.vehicles.filter((v) => v.active).length === 0)
                throw new common_1.BadRequestException('Driver has no active vehicle');
        }
        await this.prisma.$transaction([
            this.prisma.driverProfile.update({
                where: { userId: driverId },
                data: {
                    verificationStatus: dto.decision, verificationNote: dto.note ?? null,
                    ...(dto.decision === 'REJECTED' ? { availability: 'OFFLINE' } : {}),
                },
            }),
            this.prisma.verificationDocument.updateMany({
                where: { driverId, status: 'PENDING' },
                data: { status: dto.decision, reviewedById: admin.id, reviewNote: dto.note ?? null },
            }),
        ]);
        await this.audit(admin.id, `DRIVER_${dto.decision}`, 'DriverProfile', driverId, { note: dto.note });
        await this.notifications.notify(driverId, 'VERIFICATION', dto.decision === 'APPROVED' ? 'You are verified' : 'Verification needs attention', dto.decision === 'APPROVED' ? 'You can now go online and receive bookings.' : dto.note ?? 'Please review your documents and resubmit.');
        return { ok: true };
    }
    users(q) {
        return this.prisma.user.findMany({
            where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {},
            select: { id: true, name: true, email: true, phone: true, roles: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async setStatus(admin, id, dto) {
        if (id === admin.id)
            throw new common_1.BadRequestException('You cannot change your own status');
        const u = await this.prisma.user.update({ where: { id }, data: { status: dto.status }, select: { id: true, status: true } });
        if (dto.status === 'SUSPENDED') {
            await this.prisma.driverProfile.updateMany({ where: { userId: id }, data: { availability: 'OFFLINE' } });
        }
        await this.audit(admin.id, `USER_${dto.status}`, 'User', id, { reason: dto.reason });
        return u;
    }
    bookings(state) {
        return this.prisma.booking.findMany({
            where: state ? { state: state } : {},
            include: {
                customer: { select: { id: true, name: true } },
                requestedDriver: { select: { id: true, name: true } },
                assignedDriver: { select: { id: true, name: true } },
                rideDetails: true,
                payment: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    events(id) {
        return this.prisma.bookingEvent.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'asc' } });
    }
    referrals() {
        return this.prisma.referral.findMany({
            include: { proposer: { select: { id: true, name: true } }, candidate: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    reports(status) {
        return this.prisma.report.findMany({
            where: status ? { status: status } : {},
            include: {
                reporter: { select: { id: true, name: true } },
                target: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
    async updateReport(admin, id, dto) {
        const r = await this.prisma.report.update({ where: { id }, data: { status: dto.status, resolutionNote: dto.resolutionNote } });
        await this.audit(admin.id, `REPORT_${dto.status}`, 'Report', id, { note: dto.resolutionNote });
        return r;
    }
    payments() {
        return this.prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    }
    auditLogs() {
        return this.prisma.adminAuditLog.findMany({
            include: { admin: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }
    async stats() {
        const [drivers, pendingDrivers, customers, bookings, completed, cancelled, openReports, referrals, approvedReferrals] = await Promise.all([
            this.prisma.driverProfile.count({ where: { verificationStatus: 'APPROVED' } }),
            this.prisma.driverProfile.count({ where: { verificationStatus: 'PENDING' } }),
            this.prisma.user.count({ where: { roles: { has: 'CUSTOMER' } } }),
            this.prisma.booking.count(),
            this.prisma.booking.count({ where: { state: 'COMPLETED' } }),
            this.prisma.booking.count({ where: { state: { in: ['CANCELLED', 'DECLINED', 'EXPIRED'] } } }),
            this.prisma.report.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
            this.prisma.referral.count(),
            this.prisma.referral.count({ where: { state: 'CUSTOMER_APPROVED' } }),
        ]);
        return {
            verifiedDrivers: drivers, pendingDrivers, customers, bookings, completed, cancelled, openReports,
            completionRate: bookings ? completed / bookings : null,
            referrals, referralSuccessRate: referrals ? approvedReferrals / referrals : null,
        };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('verification'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "queue", null);
__decorate([
    (0, common_1.Post)('verification/:driverId'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('driverId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, VerifyDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "verify", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "users", null);
__decorate([
    (0, common_1.Patch)('users/:id/status'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, UserStatusDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Get)('bookings'),
    __param(0, (0, common_1.Query)('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "bookings", null);
__decorate([
    (0, common_1.Get)('bookings/:id/events'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "events", null);
__decorate([
    (0, common_1.Get)('referrals'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "referrals", null);
__decorate([
    (0, common_1.Get)('reports'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "reports", null);
__decorate([
    (0, common_1.Patch)('reports/:id'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, ReportUpdateDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateReport", null);
__decorate([
    (0, common_1.Get)('payments'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "payments", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "auditLogs", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "stats", null);
exports.AdminController = AdminController = __decorate([
    (0, decorators_1.Roles)('ADMIN'),
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notifications_service_1.NotificationsService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map
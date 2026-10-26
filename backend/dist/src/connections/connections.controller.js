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
exports.ConnectionsController = void 0;
const common_1 = require("@nestjs/common");
const decorators_1 = require("../common/decorators");
const geo_1 = require("../common/geo");
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
const driverCard = {
    select: {
        id: true,
        name: true,
        driverProfile: {
            select: {
                photoUrl: true, serviceArea: true, availability: true, verificationStatus: true,
                shareApproxLocation: true, shareCode: true,
                vehicles: { where: { active: true }, select: { plate: true, type: true, make: true, model: true, color: true } },
            },
        },
    },
};
let ConnectionsController = class ConnectionsController {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
    }
    async connect(user, shareCode) {
        const profile = await this.prisma.driverProfile.findUnique({ where: { shareCode: shareCode.toUpperCase() } });
        if (!profile || profile.verificationStatus !== 'APPROVED')
            throw new common_1.NotFoundException('Driver not found');
        if (profile.userId === user.id)
            throw new common_1.BadRequestException('You cannot connect to yourself');
        const existing = await this.prisma.customerDriverConnection.findUnique({
            where: { customerId_driverId: { customerId: user.id, driverId: profile.userId } },
        });
        if (existing?.status === 'BLOCKED')
            throw new common_1.ForbiddenException('This connection is not available');
        if (existing?.status === 'ACTIVE')
            return existing;
        const status = profile.requireConnectionApproval ? 'PENDING' : 'ACTIVE';
        const conn = await this.prisma.customerDriverConnection.upsert({
            where: { customerId_driverId: { customerId: user.id, driverId: profile.userId } },
            update: { status },
            create: { customerId: user.id, driverId: profile.userId, status },
        });
        if (status === 'PENDING') {
            await this.notifications.notify(profile.userId, 'CONNECTION_REQUEST', 'New connection request', 'A customer wants to add you as a trusted driver.');
        }
        return conn;
    }
    list(user) {
        return this.prisma.customerDriverConnection.findMany({
            where: { customerId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
            include: { driver: driverCard },
            orderBy: { createdAt: 'desc' },
        });
    }
    async disconnect(user, driverId) {
        await this.prisma.customerDriverConnection.updateMany({
            where: { customerId: user.id, driverId, status: { in: ['ACTIVE', 'PENDING'] } },
            data: { status: 'DISCONNECTED' },
        });
        return { ok: true };
    }
    async block(user, driverId) {
        await this.prisma.customerDriverConnection.upsert({
            where: { customerId_driverId: { customerId: user.id, driverId } },
            update: { status: 'BLOCKED' },
            create: { customerId: user.id, driverId, status: 'BLOCKED' },
        });
        return { ok: true };
    }
    customers(user) {
        return this.prisma.customerDriverConnection.findMany({
            where: { driverId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
            include: { customer: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }
    async approveCustomer(user, customerId) {
        const r = await this.prisma.customerDriverConnection.updateMany({
            where: { customerId, driverId: user.id, status: 'PENDING' },
            data: { status: 'ACTIVE' },
        });
        if (r.count === 0)
            throw new common_1.NotFoundException('No pending request');
        await this.notifications.notify(customerId, 'CONNECTION_APPROVED', 'Connection approved', 'You can now book your trusted driver.');
        return { ok: true };
    }
    async rejectCustomer(user, customerId) {
        await this.prisma.customerDriverConnection.updateMany({
            where: { customerId, driverId: user.id, status: 'PENDING' },
            data: { status: 'DISCONNECTED' },
        });
        return { ok: true };
    }
    async blockCustomer(user, customerId) {
        await this.prisma.customerDriverConnection.upsert({
            where: { customerId_driverId: { customerId, driverId: user.id } },
            update: { status: 'BLOCKED' },
            create: { customerId, driverId: user.id, status: 'BLOCKED' },
        });
        return { ok: true };
    }
    async requestPeer(user, shareCode) {
        const peer = await this.prisma.driverProfile.findUnique({ where: { shareCode: shareCode.toUpperCase() } });
        if (!peer)
            throw new common_1.NotFoundException('Driver not found');
        if (peer.userId === user.id)
            throw new common_1.BadRequestException('You cannot connect to yourself');
        const [a, b] = (0, geo_1.orderPair)(user.id, peer.userId);
        const existing = await this.prisma.driverConnection.findUnique({ where: { driverAId_driverBId: { driverAId: a, driverBId: b } } });
        if (existing && existing.trustStatus !== 'REVOKED')
            return existing;
        const link = await this.prisma.driverConnection.upsert({
            where: { driverAId_driverBId: { driverAId: a, driverBId: b } },
            update: { trustStatus: 'PENDING', requestedBy: user.id },
            create: { driverAId: a, driverBId: b, requestedBy: user.id, trustStatus: 'PENDING' },
        });
        await this.notifications.notify(peer.userId, 'PEER_REQUEST', 'Trusted driver request', 'A fellow driver wants to add you to their trusted network.');
        return link;
    }
    async peers(user) {
        const links = await this.prisma.driverConnection.findMany({
            where: { OR: [{ driverAId: user.id }, { driverBId: user.id }], trustStatus: { in: ['PENDING', 'TRUSTED'] } },
            include: { driverA: driverCard, driverB: driverCard },
        });
        return links.map((l) => ({
            id: l.id,
            trustStatus: l.trustStatus,
            requestedByMe: l.requestedBy === user.id,
            peer: l.driverAId === user.id ? l.driverB : l.driverA,
        }));
    }
    async acceptPeer(user, peerId) {
        const [a, b] = (0, geo_1.orderPair)(user.id, peerId);
        const link = await this.prisma.driverConnection.findUnique({ where: { driverAId_driverBId: { driverAId: a, driverBId: b } } });
        if (!link || link.trustStatus !== 'PENDING' || link.requestedBy === user.id)
            throw new common_1.NotFoundException('No pending request');
        await this.prisma.driverConnection.update({ where: { id: link.id }, data: { trustStatus: 'TRUSTED' } });
        await this.notifications.notify(peerId, 'PEER_ACCEPTED', 'Trusted driver added', 'Your trusted driver request was accepted.');
        return { ok: true };
    }
    async revokePeer(user, peerId) {
        const [a, b] = (0, geo_1.orderPair)(user.id, peerId);
        await this.prisma.driverConnection.updateMany({
            where: { driverAId: a, driverBId: b },
            data: { trustStatus: 'REVOKED' },
        });
        return { ok: true };
    }
};
exports.ConnectionsController = ConnectionsController;
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Post)('customer/connect/:shareCode'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('shareCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "connect", null);
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Get)('customer'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConnectionsController.prototype, "list", null);
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Delete)('customer/:driverId'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('driverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "disconnect", null);
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Post)('customer/:driverId/block'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('driverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "block", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Get)('driver/customers'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConnectionsController.prototype, "customers", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('driver/customers/:customerId/approve'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "approveCustomer", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('driver/customers/:customerId/reject'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "rejectCustomer", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('driver/customers/:customerId/block'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "blockCustomer", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('drivers/request/:shareCode'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('shareCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "requestPeer", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Get)('drivers'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "peers", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('drivers/:peerId/accept'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('peerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "acceptPeer", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Delete)('drivers/:peerId'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('peerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ConnectionsController.prototype, "revokePeer", null);
exports.ConnectionsController = ConnectionsController = __decorate([
    (0, common_1.Controller)('connections'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notifications_service_1.NotificationsService])
], ConnectionsController);
//# sourceMappingURL=connections.controller.js.map
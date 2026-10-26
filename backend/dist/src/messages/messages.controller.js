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
exports.MessagesController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const decorators_1 = require("../common/decorators");
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
class SendMessageDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], SendMessageDto.prototype, "content", void 0);
let MessagesController = class MessagesController {
    constructor(prisma, notifications, realtime) {
        this.prisma = prisma;
        this.notifications = notifications;
        this.realtime = realtime;
    }
    async participants(bookingId, userId) {
        const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { customerId: true, assignedDriverId: true, state: true } });
        if (!b)
            throw new common_1.NotFoundException();
        if (!b.assignedDriverId)
            throw new common_1.BadRequestException('Chat opens once a driver is assigned');
        if (userId !== b.customerId && userId !== b.assignedDriverId)
            throw new common_1.ForbiddenException();
        return { b, other: userId === b.customerId ? b.assignedDriverId : b.customerId };
    }
    async list(user, bookingId) {
        await this.participants(bookingId, user.id);
        return this.prisma.message.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' }, take: 200 });
    }
    async send(user, bookingId, dto) {
        const { other } = await this.participants(bookingId, user.id);
        const m = await this.prisma.message.create({ data: { bookingId, senderId: user.id, content: dto.content.trim() } });
        this.realtime.emitToUser(other, 'message', m);
        await this.notifications.notify(other, 'MESSAGE', 'New message', dto.content.slice(0, 80), { bookingId });
        return m;
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('bookingId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('bookingId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, SendMessageDto]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "send", null);
exports.MessagesController = MessagesController = __decorate([
    (0, common_1.Controller)('bookings/:bookingId/messages'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        realtime_gateway_1.RealtimeGateway])
], MessagesController);
//# sourceMappingURL=messages.controller.js.map
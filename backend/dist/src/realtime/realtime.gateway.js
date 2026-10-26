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
var RealtimeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const jwt_strategy_1 = require("../auth/jwt.strategy");
const locations_service_1 = require("../locations/locations.service");
const prisma_service_1 = require("../prisma/prisma.service");
function readCookie(header, name) {
    if (!header)
        return undefined;
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name)
            return decodeURIComponent(v.join('='));
    }
    return undefined;
}
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    constructor(jwt, prisma, locations) {
        this.jwt = jwt;
        this.prisma = prisma;
        this.locations = locations;
        this.logger = new common_1.Logger(RealtimeGateway_1.name);
    }
    async handleConnection(client) {
        try {
            const token = readCookie(client.handshake.headers.cookie, jwt_strategy_1.COOKIE_NAME) ??
                client.handshake.auth?.token;
            if (!token)
                throw new Error('missing token');
            const payload = this.jwt.verify(token);
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                select: { id: true, roles: true, status: true },
            });
            if (!user || user.status !== 'ACTIVE')
                throw new Error('inactive');
            client.data.user = { id: user.id, roles: user.roles };
            await client.join(`user:${user.id}`);
        }
        catch {
            client.disconnect(true);
        }
    }
    emitToUser(userId, event, payload) {
        this.server?.to(`user:${userId}`).emit(event, payload);
    }
    async onLocationUpdate(client, body) {
        const user = client.data.user;
        if (!user)
            return { ok: false, error: 'unauthenticated' };
        try {
            const out = await this.locations.ingest(user.id, body);
            if (out)
                this.emitToUser(out.customerId, 'location:update', out.payload);
            return { ok: true, throttled: !out };
        }
        catch (e) {
            return { ok: false, error: e.message };
        }
    }
    async onSubscribe(client, body) {
        const user = client.data.user;
        if (!user)
            return { ok: false, error: 'unauthenticated' };
        try {
            await this.locations.authorizeSubscription(user.id, body.bookingId);
            await client.join(`booking-track:${body.bookingId}`);
            const latest = await this.locations.latestForBooking(user.id, body.bookingId);
            return { ok: true, latest };
        }
        catch (e) {
            this.logger.debug(`subscribe denied: ${e.message}`);
            return { ok: false, error: 'not authorized for this booking' };
        }
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('location:update'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "onLocationUpdate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('location:subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "onSubscribe", null);
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/realtime',
        cors: { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true },
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        prisma_service_1.PrismaService,
        locations_service_1.LocationsService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map
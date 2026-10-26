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
exports.DriversController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const decorators_1 = require("../common/decorators");
const geo_1 = require("../common/geo");
const prisma_service_1 = require("../prisma/prisma.service");
class UpdateProfileDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "bio", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "serviceArea", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateProfileDto.prototype, "requireConnectionApproval", void 0);
class AvailabilityDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['ONLINE', 'OFFLINE']),
    __metadata("design:type", String)
], AvailabilityDto.prototype, "availability", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AvailabilityDto.prototype, "shareApproxLocation", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsLatitude)(),
    __metadata("design:type", Number)
], AvailabilityDto.prototype, "lat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsLongitude)(),
    __metadata("design:type", Number)
], AvailabilityDto.prototype, "lng", void 0);
class ServiceItemDto {
}
__decorate([
    (0, class_validator_1.IsEnum)(client_1.ServiceType),
    __metadata("design:type", String)
], ServiceItemDto.prototype, "serviceType", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ServiceItemDto.prototype, "active", void 0);
class ServicesDto {
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(10),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ServiceItemDto),
    __metadata("design:type", Array)
], ServicesDto.prototype, "services", void 0);
class VehicleDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(12),
    __metadata("design:type", String)
], VehicleDto.prototype, "plate", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.VehicleType),
    __metadata("design:type", String)
], VehicleDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], VehicleDto.prototype, "make", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], VehicleDto.prototype, "model", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], VehicleDto.prototype, "color", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(60),
    __metadata("design:type", Number)
], VehicleDto.prototype, "capacity", void 0);
class DocumentDto {
}
__decorate([
    (0, class_validator_1.IsEnum)(client_1.DocumentKind),
    __metadata("design:type", String)
], DocumentDto.prototype, "kind", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], DocumentDto.prototype, "storageKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DocumentDto.prototype, "vehicleId", void 0);
let DriversController = class DriversController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async publicProfile(shareCode) {
        const p = await this.prisma.driverProfile.findUnique({
            where: { shareCode: shareCode.toUpperCase() },
            include: {
                user: { select: { id: true, name: true } },
                vehicles: { where: { active: true }, select: { plate: true, type: true, make: true, model: true, color: true, capacity: true } },
                services: { where: { active: true }, select: { serviceType: true } },
            },
        });
        if (!p || p.verificationStatus !== 'APPROVED')
            throw new common_1.NotFoundException('Driver not found');
        const rating = await this.prisma.review.aggregate({ where: { driverId: p.userId }, _avg: { rating: true }, _count: true });
        return {
            id: p.userId,
            name: p.user.name,
            photoUrl: p.photoUrl,
            bio: p.bio,
            serviceArea: p.serviceArea,
            verified: true,
            availability: p.availability,
            requireConnectionApproval: p.requireConnectionApproval,
            vehicles: p.vehicles,
            services: p.services.map((s) => s.serviceType),
            rating: { average: rating._avg.rating, count: rating._count },
            shareCode: p.shareCode,
        };
    }
    async me(user) {
        const p = await this.prisma.driverProfile.findUnique({
            where: { userId: user.id },
            include: { vehicles: true, services: true, documents: { orderBy: { createdAt: 'desc' } } },
        });
        if (!p)
            throw new common_1.NotFoundException();
        const base = process.env.APP_URL ?? 'http://localhost:5173';
        return { ...p, shareLink: `${base}/d/${p.shareCode}` };
    }
    update(user, dto) {
        return this.prisma.driverProfile.update({ where: { userId: user.id }, data: dto });
    }
    async setAvailability(user, dto) {
        const profile = await this.prisma.driverProfile.findUniqueOrThrow({ where: { userId: user.id } });
        if (dto.availability === 'ONLINE' && profile.verificationStatus !== 'APPROVED') {
            throw new common_1.BadRequestException('Only verified drivers can go online');
        }
        const share = dto.shareApproxLocation ?? profile.shareApproxLocation;
        const hasCoords = typeof dto.lat === 'number' && typeof dto.lng === 'number';
        return this.prisma.driverProfile.update({
            where: { userId: user.id },
            data: {
                availability: dto.availability,
                shareApproxLocation: share,
                approxLat: share && hasCoords && dto.availability === 'ONLINE' ? (0, geo_1.approximate)(dto.lat) : null,
                approxLng: share && hasCoords && dto.availability === 'ONLINE' ? (0, geo_1.approximate)(dto.lng) : null,
                approxUpdatedAt: share && hasCoords ? new Date() : null,
            },
            select: { availability: true, shareApproxLocation: true },
        });
    }
    async setServices(user, dto) {
        await this.prisma.$transaction(dto.services.map((s) => this.prisma.driverService.upsert({
            where: { driverId_serviceType: { driverId: user.id, serviceType: s.serviceType } },
            update: { active: s.active },
            create: { driverId: user.id, serviceType: s.serviceType, active: s.active },
        })));
        return this.prisma.driverService.findMany({ where: { driverId: user.id } });
    }
    addVehicle(user, dto) {
        return this.prisma.vehicle.create({ data: { ...dto, plate: dto.plate.toUpperCase().replace(/\s+/g, ' ').trim(), driverId: user.id } });
    }
    async deactivateVehicle(user, id) {
        await this.prisma.vehicle.updateMany({ where: { id, driverId: user.id }, data: { active: false } });
        return { ok: true };
    }
    async addDocument(user, dto) {
        if (dto.vehicleId) {
            const v = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, driverId: user.id } });
            if (!v)
                throw new common_1.BadRequestException('Unknown vehicle');
        }
        await this.prisma.driverProfile.updateMany({
            where: { userId: user.id, verificationStatus: 'REJECTED' },
            data: { verificationStatus: 'PENDING', verificationNote: null },
        });
        return this.prisma.verificationDocument.create({ data: { ...dto, driverId: user.id } });
    }
};
exports.DriversController = DriversController;
__decorate([
    (0, decorators_1.Public)(),
    (0, common_1.Get)('public/:shareCode'),
    __param(0, (0, common_1.Param)('shareCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "publicProfile", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Get)('me'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "me", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Put)('me'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, UpdateProfileDto]),
    __metadata("design:returntype", void 0)
], DriversController.prototype, "update", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Put)('me/availability'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AvailabilityDto]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "setAvailability", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Put)('me/services'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ServicesDto]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "setServices", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('me/vehicles'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, VehicleDto]),
    __metadata("design:returntype", void 0)
], DriversController.prototype, "addVehicle", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Delete)('me/vehicles/:id'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "deactivateVehicle", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)('me/documents'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DocumentDto]),
    __metadata("design:returntype", Promise)
], DriversController.prototype, "addDocument", null);
exports.DriversController = DriversController = __decorate([
    (0, common_1.Controller)('drivers'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DriversController);
//# sourceMappingURL=drivers.controller.js.map
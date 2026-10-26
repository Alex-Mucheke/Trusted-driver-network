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
exports.ReviewsController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const decorators_1 = require("../common/decorators");
const prisma_service_1 = require("../prisma/prisma.service");
class ReviewDto {
}
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReviewDto.prototype, "bookingId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], ReviewDto.prototype, "rating", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ReviewDto.prototype, "comment", void 0);
class ReportDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.ReportType),
    __metadata("design:type", String)
], ReportDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReportDto.prototype, "bookingId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ReportDto.prototype, "targetUserId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], ReportDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ReportDto.prototype, "description", void 0);
let ReviewsController = class ReviewsController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async review(user, dto) {
        const b = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
        if (!b)
            throw new common_1.NotFoundException('Booking not found');
        if (b.customerId !== user.id)
            throw new common_1.ForbiddenException();
        if (b.state !== 'COMPLETED' || !b.assignedDriverId)
            throw new common_1.BadRequestException('Only completed trips can be reviewed');
        try {
            return await this.prisma.review.create({
                data: { bookingId: b.id, authorId: user.id, driverId: b.assignedDriverId, rating: dto.rating, comment: dto.comment },
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new common_1.ConflictException('You already reviewed this trip');
            throw e;
        }
    }
    async report(user, dto) {
        if (dto.bookingId) {
            const b = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
            if (!b || ![b.customerId, b.requestedDriverId, b.assignedDriverId].includes(user.id))
                throw new common_1.ForbiddenException();
        }
        if (!dto.bookingId && !dto.targetUserId)
            throw new common_1.BadRequestException('Provide a booking or a user to report');
        return this.prisma.report.create({
            data: {
                type: dto.type ?? 'REPORT', reporterId: user.id, targetUserId: dto.targetUserId, bookingId: dto.bookingId,
                category: dto.category, description: dto.description,
            },
        });
    }
};
exports.ReviewsController = ReviewsController;
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Post)('reviews'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ReviewDto]),
    __metadata("design:returntype", Promise)
], ReviewsController.prototype, "review", null);
__decorate([
    (0, common_1.Post)('reports'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ReportDto]),
    __metadata("design:returntype", Promise)
], ReviewsController.prototype, "report", null);
exports.ReviewsController = ReviewsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReviewsController);
//# sourceMappingURL=reviews.controller.js.map
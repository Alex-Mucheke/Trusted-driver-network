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
exports.ReferralsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const decorators_1 = require("../common/decorators");
const referrals_service_1 = require("./referrals.service");
class ProposeDto {
}
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ProposeDto.prototype, "bookingId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ProposeDto.prototype, "candidateId", void 0);
class CandidateResponseDto {
}
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CandidateResponseDto.prototype, "accept", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(240),
    __metadata("design:type", Number)
], CandidateResponseDto.prototype, "etaMinutes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CandidateResponseDto.prototype, "revisedQuote", void 0);
class CustomerResponseDto {
}
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CustomerResponseDto.prototype, "approve", void 0);
let ReferralsController = class ReferralsController {
    constructor(referrals) {
        this.referrals = referrals;
    }
    propose(user, dto) {
        return this.referrals.propose(user.id, dto.bookingId, dto.candidateId);
    }
    candidates(user, bookingId) {
        return this.referrals.candidates(user.id, bookingId);
    }
    incoming(user) {
        return this.referrals.incoming(user.id);
    }
    candidateRespond(user, id, dto) {
        return this.referrals.candidateRespond(user.id, id, dto);
    }
    customerDecision(user, id, dto) {
        return this.referrals.customerDecision(user.id, id, dto.approve);
    }
    cancel(user, id) {
        return this.referrals.cancel(user.id, id);
    }
};
exports.ReferralsController = ReferralsController;
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)(),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ProposeDto]),
    __metadata("design:returntype", void 0)
], ReferralsController.prototype, "propose", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Get)('candidates/:bookingId'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('bookingId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReferralsController.prototype, "candidates", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Get)('incoming'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReferralsController.prototype, "incoming", null);
__decorate([
    (0, decorators_1.Roles)('DRIVER'),
    (0, common_1.Post)(':id/respond'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, CandidateResponseDto]),
    __metadata("design:returntype", void 0)
], ReferralsController.prototype, "candidateRespond", null);
__decorate([
    (0, decorators_1.Roles)('CUSTOMER'),
    (0, common_1.Post)(':id/decision'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, CustomerResponseDto]),
    __metadata("design:returntype", void 0)
], ReferralsController.prototype, "customerDecision", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReferralsController.prototype, "cancel", null);
exports.ReferralsController = ReferralsController = __decorate([
    (0, common_1.Controller)('referrals'),
    __metadata("design:paramtypes", [referrals_service_1.ReferralsService])
], ReferralsController);
//# sourceMappingURL=referrals.controller.js.map
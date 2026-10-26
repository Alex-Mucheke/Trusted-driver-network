"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
exports.newShareCode = newShareCode;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const SHARE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newShareCode(len = 8) {
    const bytes = (0, crypto_1.randomBytes)(len);
    return Array.from(bytes, (b) => SHARE_ALPHABET[b % SHARE_ALPHABET.length]).join('');
}
const userSelect = { id: true, name: true, email: true, phone: true, roles: true, status: true };
let AuthService = class AuthService {
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
    }
    async register(dto) {
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const role = dto.role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';
        try {
            const user = await this.prisma.user.create({
                data: {
                    name: dto.name.trim(),
                    email: dto.email.toLowerCase(),
                    phone: dto.phone,
                    passwordHash,
                    roles: [role],
                    ...(role === 'DRIVER'
                        ? {
                            driverProfile: {
                                create: {
                                    shareCode: newShareCode(),
                                    services: { create: [{ serviceType: 'RIDE', active: true }] },
                                },
                            },
                        }
                        : {}),
                },
                select: userSelect,
            });
            return { user, token: this.sign(user.id) };
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new common_1.ConflictException('Email or phone number is already registered');
            }
            throw e;
        }
    }
    async login(dto) {
        const row = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
        const ok = row ? await bcrypt.compare(dto.password, row.passwordHash) : false;
        if (!row || !ok)
            throw new common_1.UnauthorizedException('Invalid email or password');
        if (row.status !== 'ACTIVE')
            throw new common_1.UnauthorizedException('Account suspended');
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.id }, select: userSelect });
        return { user, token: this.sign(row.id) };
    }
    me(userId) {
        return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    }
    sign(userId) {
        return this.jwt.sign({ sub: userId });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
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
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function user(name, email, phone, roles, password) {
    return prisma.user.upsert({
        where: { email },
        update: {},
        create: { name, email, phone, roles, passwordHash: await bcrypt.hash(password, 12) },
    });
}
async function verifiedDriver(u, shareCode, plate, make, model) {
    await prisma.driverProfile.upsert({
        where: { userId: u.id },
        update: {},
        create: {
            userId: u.id, shareCode, verificationStatus: 'APPROVED', availability: 'ONLINE', serviceArea: 'Chuka Town',
            bio: 'Demo driver (seed data).',
            services: { create: [{ serviceType: 'RIDE', active: true }] },
            vehicles: { create: [{ plate, type: 'SEDAN', make, model, color: 'White', capacity: 4 }] },
        },
    });
}
async function main() {
    await user('Platform Admin', process.env.ADMIN_EMAIL ?? 'admin@example.com', '+254700000000', ['ADMIN'], process.env.ADMIN_PASSWORD ?? 'ChangeMe123!');
    if (process.env.SEED_DEMO !== 'true')
        return;
    const pw = 'Password123!';
    const customer = await user('Demo Customer', 'customer@example.com', '+254711000001', ['CUSTOMER'], pw);
    const a = await user('Driver Alice', 'alice@example.com', '+254711000002', ['DRIVER'], pw);
    const b = await user('Driver Bob', 'bob@example.com', '+254711000003', ['DRIVER'], pw);
    await verifiedDriver(a, 'ALICE234', 'KDA 100A', 'Toyota', 'Axio');
    await verifiedDriver(b, 'BOB23456', 'KDB 200B', 'Toyota', 'Premio');
    await prisma.customerDriverConnection.upsert({
        where: { customerId_driverId: { customerId: customer.id, driverId: a.id } },
        update: {},
        create: { customerId: customer.id, driverId: a.id, status: 'ACTIVE' },
    });
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await prisma.driverConnection.upsert({
        where: { driverAId_driverBId: { driverAId: x, driverBId: y } },
        update: {},
        create: { driverAId: x, driverBId: y, requestedBy: a.id, trustStatus: 'TRUSTED' },
    });
    console.log('Seeded. Demo logins (password Password123!): customer@example.com, alice@example.com, bob@example.com');
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map
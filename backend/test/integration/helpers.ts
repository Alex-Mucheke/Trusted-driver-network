import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { BookingsService } from '../../src/bookings/bookings.service';
import { EligibilityService } from '../../src/drivers/eligibility.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrivacyService } from '../../src/privacy/privacy.service';
import { RetentionService } from '../../src/privacy/retention.service';
import { ReferralsService } from '../../src/referrals/referrals.service';

/** Real services wired to a real database (realtime gateway omitted: it is optional). */
export function makeApp() {
  const prisma = new PrismaService();
  const eligibility = new EligibilityService();
  const notifications = new NotificationsService(prisma);
  const bookings = new BookingsService(prisma, eligibility, notifications);
  const referrals = new ReferralsService(prisma, bookings, eligibility, notifications);
  const privacy = new PrivacyService(prisma);
  const retention = new RetentionService(prisma);
  return { prisma, bookings, referrals, privacy, retention };
}
export type App = ReturnType<typeof makeApp>;

const tag = () => randomBytes(5).toString('hex');

export async function makeCustomer(prisma: PrismaService, password = 'test-password-123') {
  const t = tag();
  return prisma.user.create({
    data: {
      name: `Customer ${t}`,
      email: `customer-${t}@test.local`,
      phone: `+2547${Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, '0')}`,
      passwordHash: await bcrypt.hash(password, 4),
      roles: ['CUSTOMER'],
    },
  });
}

/** A verified, online driver with a vehicle who offers rides. */
export async function makeDriver(prisma: PrismaService) {
  const t = tag();
  return prisma.user.create({
    data: {
      name: `Driver ${t}`,
      email: `driver-${t}@test.local`,
      phone: `+2547${Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, '0')}`,
      passwordHash: 'not-used',
      roles: ['DRIVER'],
      driverProfile: {
        create: {
          shareCode: t.toUpperCase().padEnd(8, 'X').slice(0, 8),
          verificationStatus: 'APPROVED',
          availability: 'ONLINE',
          services: { create: [{ serviceType: 'RIDE', active: true }] },
          vehicles: {
            create: [
              {
                plate: `KT-${t}`,
                type: 'SEDAN',
                make: 'Toyota',
                model: 'Axio',
                color: 'White',
                capacity: 4,
              },
            ],
          },
        },
      },
    },
  });
}

export async function connect(prisma: PrismaService, customerId: string, driverId: string) {
  await prisma.customerDriverConnection.create({
    data: { customerId, driverId, status: 'ACTIVE' },
  });
}

export async function trust(prisma: PrismaService, a: string, b: string) {
  const [driverAId, driverBId] = a < b ? [a, b] : [b, a];
  await prisma.driverConnection.create({
    data: { driverAId, driverBId, requestedBy: a, trustStatus: 'TRUSTED' },
  });
}

export function makeBooking(prisma: PrismaService, customerId: string, driverId: string) {
  return prisma.booking.create({
    data: {
      customerId,
      requestedDriverId: driverId,
      type: 'RIDE',
      state: 'REQUESTED',
      quote: 300,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      notes: 'Please call at the gate',
      rideDetails: {
        create: {
          pickupAddress: '12 Market Road',
          pickupLat: -0.33,
          pickupLng: 37.65,
          dropoffAddress: '4 Hospital Lane',
          dropoffLat: -0.31,
          dropoffLng: 37.62,
          distanceKm: 3.2,
        },
      },
    },
  });
}

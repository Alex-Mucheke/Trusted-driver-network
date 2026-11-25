jest.mock('@prisma/client', () => ({ Prisma: {}, PrismaClient: class {} }));

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EligibilityService } from './eligibility.service';

const MIN = 60 * 1000;

function profile(over: Record<string, unknown> = {}) {
  return {
    verificationStatus: 'APPROVED',
    availability: 'ONLINE',
    user: { status: 'ACTIVE' },
    services: [{ serviceType: 'RIDE', active: true }],
    vehicles: [{ id: 'v1' }],
    ...over,
  };
}

function client(p: unknown, jobs: Array<{ scheduledAt: Date | null }> = []) {
  return {
    driverProfile: { findUnique: jest.fn().mockResolvedValue(p) },
    booking: { findMany: jest.fn().mockResolvedValue(jobs) },
  } as any;
}

describe('EligibilityService', () => {
  const svc = new EligibilityService();

  it('accepts a verified, online driver with a vehicle and no other job', async () => {
    await expect(
      svc.assertEligible(client(profile()), 'd1', 'RIDE', null),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['not verified', profile({ verificationStatus: 'PENDING' })],
    ['rejected', profile({ verificationStatus: 'REJECTED' })],
    ['suspended', profile({ user: { status: 'SUSPENDED' } })],
    ['has no profile', null],
  ])('refuses a driver who is %s', async (_label, p) => {
    await expect(svc.assertEligible(client(p), 'd1', 'RIDE', null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("needs an immediate job's driver to be online, but not a scheduled one", async () => {
    const offline = profile({ availability: 'OFFLINE' });
    await expect(svc.assertEligible(client(offline), 'd1', 'RIDE', null)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      svc.assertEligible(client(offline), 'd1', 'RIDE', new Date(Date.now() + 3 * 60 * MIN)),
    ).resolves.toBeUndefined();
  });

  it('refuses a service the driver does not offer', async () => {
    await expect(
      svc.assertEligible(client(profile()), 'd1', 'PARCEL', null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a driver without an active vehicle', async () => {
    await expect(
      svc.assertEligible(client(profile({ vehicles: [] })), 'd1', 'RIDE', null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an immediate job while the driver is already on a job', async () => {
    await expect(
      svc.assertEligible(client(profile(), [{ scheduledAt: null }]), 'd1', 'RIDE', null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows scheduled jobs 90+ minutes apart and refuses overlapping ones', async () => {
    const base = Date.now() + 5 * 60 * MIN;
    const existing = [{ scheduledAt: new Date(base) }];
    await expect(
      svc.assertEligible(client(profile(), existing), 'd1', 'RIDE', new Date(base + 120 * MIN)),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertEligible(client(profile(), existing), 'd1', 'RIDE', new Date(base + 30 * MIN)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('isEligible turns failures into false', async () => {
    expect(await svc.isEligible(client(profile()), 'd1', 'RIDE', null)).toBe(true);
    expect(await svc.isEligible(client(null), 'd1', 'RIDE', null)).toBe(false);
  });
});

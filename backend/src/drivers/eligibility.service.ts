import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, ServiceType } from '@prisma/client';
import { ACTIVE_JOB_STATES } from '../bookings/booking-state';

/** Window (ms) within which two jobs are considered overlapping. */
const OVERLAP_WINDOW_MS = 90 * 60 * 1000;

/**
 * Single source of truth for "can this driver take this job?". Used for direct acceptance,
 * referral candidates, and re-checked inside the assignment transaction.
 */
@Injectable()
export class EligibilityService {
  async assertEligible(
    client: Prisma.TransactionClient,
    driverId: string,
    type: ServiceType,
    scheduledAt: Date | null,
  ): Promise<void> {
    const profile = await client.driverProfile.findUnique({
      where: { userId: driverId },
      include: {
        user: { select: { status: true } },
        services: true,
        vehicles: { where: { active: true }, take: 1 },
      },
    });
    if (!profile || profile.verificationStatus !== 'APPROVED' || profile.user.status !== 'ACTIVE') {
      throw new ForbiddenException('Driver is not verified');
    }
    // Scheduled jobs may be taken while offline; immediate jobs need the driver online.
    if (!scheduledAt && profile.availability !== 'ONLINE') {
      throw new ConflictException('Driver is not available right now');
    }
    if (!profile.services.some((s) => s.serviceType === type && s.active)) {
      throw new BadRequestException('Driver does not offer this service');
    }
    if (profile.vehicles.length === 0) {
      throw new BadRequestException('Driver has no active vehicle');
    }

    const t = (scheduledAt ?? new Date()).getTime();
    const now = Date.now();
    const jobs = await client.booking.findMany({
      where: { assignedDriverId: driverId, state: { in: ACTIVE_JOB_STATES as any } },
      select: { scheduledAt: true },
    });
    const busy = jobs.some((j) =>
      j.scheduledAt ? Math.abs(j.scheduledAt.getTime() - t) < OVERLAP_WINDOW_MS : t - now < OVERLAP_WINDOW_MS,
    );
    if (busy) throw new ConflictException('Driver is already on another job');
  }

  async isEligible(client: Prisma.TransactionClient, driverId: string, type: ServiceType, scheduledAt: Date | null) {
    try {
      await this.assertEligible(client, driverId, type, scheduledAt);
      return true;
    } catch {
      return false;
    }
  }
}

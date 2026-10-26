import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ACTIVE_JOB_STATES } from '../bookings/booking-state';
import { PrismaService } from '../prisma/prisma.service';

const MAX_STALE_MS = 60_000;

@Injectable()
export class LocationsService {
  /** driverId -> last accepted timestamp (ms). In-memory throttle; use Redis if you run several instances. */
  private lastSeen = new Map<string, number>();

  constructor(private prisma: PrismaService) {}

  private get minInterval() {
    return Number(process.env.LOCATION_MIN_INTERVAL_MS ?? 2000);
  }

  /**
   * Driver pushes a position. Accepted ONLY for a booking the driver is assigned to and that is in an
   * active state. Returns null when throttled/stale (dropped silently), otherwise who to notify.
   */
  async ingest(
    driverId: string,
    body: { bookingId: string; lat: number; lng: number; accuracy?: number; capturedAt?: string },
  ) {
    const { bookingId, lat, lng } = body ?? ({} as typeof body);
    if (typeof bookingId !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Invalid location payload');
    }
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, assignedDriverId: driverId, state: { in: ACTIVE_JOB_STATES as any } },
      select: { id: true, customerId: true },
    });
    // Sharing stops automatically on completion / cancellation: the state check fails.
    if (!booking) throw new ForbiddenException('No active booking for location sharing');

    const now = Date.now();
    const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date(now);
    if (Number.isNaN(capturedAt.getTime()) || now - capturedAt.getTime() > MAX_STALE_MS) return null; // stale GPS
    const last = this.lastSeen.get(driverId) ?? 0;
    if (now - last < this.minInterval) return null; // throttled
    this.lastSeen.set(driverId, now);

    const retentionMs = Number(process.env.LOCATION_RETENTION_MINUTES ?? 60) * 60_000;
    await this.prisma.driverLocation.create({
      data: {
        driverId, bookingId, lat, lng,
        accuracy: typeof body.accuracy === 'number' ? body.accuracy : null,
        capturedAt,
        expiresAt: new Date(now + retentionMs),
      },
    });
    return {
      customerId: booking.customerId,
      payload: { bookingId, lat, lng, accuracy: body.accuracy ?? null, capturedAt: capturedAt.toISOString() },
    };
  }

  /** Only the customer who owns an ACTIVE booking may follow its driver. */
  async authorizeSubscription(userId: string, bookingId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: userId, state: { in: ACTIVE_JOB_STATES as any } },
      select: { id: true },
    });
    if (!b) throw new ForbiddenException();
    return b;
  }

  /** Latest fix for the customer's active booking (also the polling fallback for weak connections). */
  async latestForBooking(userId: string, bookingId: string) {
    await this.authorizeSubscription(userId, bookingId);
    const l = await this.prisma.driverLocation.findFirst({
      where: { bookingId, expiresAt: { gt: new Date() } },
      orderBy: { capturedAt: 'desc' },
      select: { lat: true, lng: true, accuracy: true, capturedAt: true },
    });
    return l ? { bookingId, ...l } : null;
  }

  /** Approximate availability of the customer's connected drivers (consent-based, ~1 km precision). */
  async approximateForCustomer(customerId: string) {
    const conns = await this.prisma.customerDriverConnection.findMany({
      where: { customerId, status: 'ACTIVE' },
      select: {
        driver: {
          select: {
            id: true, name: true,
            driverProfile: { select: { availability: true, shareApproxLocation: true, approxLat: true, approxLng: true, approxUpdatedAt: true, serviceArea: true } },
          },
        },
      },
    });
    return conns.map(({ driver }) => {
      const p = driver.driverProfile;
      const share = !!p?.shareApproxLocation && p.availability === 'ONLINE';
      return {
        driverId: driver.id,
        name: driver.name,
        availability: p?.availability ?? 'OFFLINE',
        serviceArea: p?.serviceArea ?? null,
        approx: share && p?.approxLat != null ? { lat: p.approxLat, lng: p.approxLng, updatedAt: p.approxUpdatedAt } : null,
      };
    });
  }

  /** Raw coordinates have a short life. */
  @Interval(5 * 60_000)
  async purgeExpired() {
    await this.prisma.driverLocation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, v] of this.lastSeen) if (v < cutoff) this.lastSeen.delete(k);
  }
}

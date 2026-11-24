import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BookingState, Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators';
import { estimateFare, haversineKm } from '../common/geo';
import { EligibilityService } from '../drivers/eligibility.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStateName,
  canTransition,
  CUSTOMER_CANCELLABLE,
  DRIVER_CANCELLABLE,
  DRIVER_PROGRESS_STATES,
} from './booking-state';
import { CreateBookingDto } from './bookings.dto';

type Tx = Prisma.TransactionClient;

const driverPublic = {
  select: {
    id: true,
    name: true,
    driverProfile: {
      select: {
        photoUrl: true,
        vehicles: {
          where: { active: true },
          select: { plate: true, type: true, make: true, model: true, color: true, capacity: true },
        },
      },
    },
  },
} as const;

const REQUEST_TTL_MIN = () => Number(process.env.BOOKING_REQUEST_TTL_MINUTES ?? 15);

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private eligibility: EligibilityService,
    private notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ create

  async create(customerId: string, dto: CreateBookingDto) {
    if (dto.type !== 'RIDE') {
      // Schema is ready for parcels/errands (Phase 7) but the MVP only exposes rides.
      throw new BadRequestException('Only ride bookings are available in this release');
    }
    if (dto.driverId === customerId) throw new BadRequestException('Invalid driver');

    const conn = await this.prisma.customerDriverConnection.findUnique({
      where: { customerId_driverId: { customerId, driverId: dto.driverId } },
    });
    if (!conn || conn.status !== 'ACTIVE')
      throw new ForbiddenException('Connect with this driver before booking');

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() < Date.now() + 10 * 60 * 1000) {
      throw new BadRequestException('Scheduled time must be at least 10 minutes from now');
    }

    // The requested driver must at least be verified & offer the service. Online/busy is
    // enforced at acceptance time, so customers can still queue a request for a busy driver
    // (who can then refer the job).
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId: dto.driverId },
      include: { user: { select: { status: true } }, services: true },
    });
    if (!profile || profile.verificationStatus !== 'APPROVED' || profile.user.status !== 'ACTIVE') {
      throw new BadRequestException('This driver is not currently verified');
    }
    if (!profile.services.some((s) => s.serviceType === dto.type && s.active)) {
      throw new BadRequestException('This driver does not offer rides');
    }

    const distanceKm = haversineKm(
      dto.pickup.lat,
      dto.pickup.lng,
      dto.dropoff.lat,
      dto.dropoff.lng,
    );
    const quote = estimateFare(distanceKm); // client-supplied prices are never trusted
    const expiresAt = scheduledAt ?? new Date(Date.now() + REQUEST_TTL_MIN() * 60 * 1000);

    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          customerId,
          requestedDriverId: dto.driverId,
          type: 'RIDE',
          state: 'REQUESTED',
          quote,
          scheduledAt,
          passengerCount: dto.passengerCount ?? 1,
          notes: dto.notes,
          expiresAt,
          rideDetails: {
            create: {
              pickupAddress: dto.pickup.address,
              pickupLat: dto.pickup.lat,
              pickupLng: dto.pickup.lng,
              dropoffAddress: dto.dropoff.address,
              dropoffLat: dto.dropoff.lat,
              dropoffLng: dto.dropoff.lng,
              distanceKm: Math.round(distanceKm * 10) / 10,
            },
          },
        },
      });
      await this.event(tx, b.id, 'REQUESTED', customerId, { quote });
      return b;
    });

    await this.notifications.notify(
      dto.driverId,
      'BOOKING_REQUESTED',
      'New ride request',
      `Estimated fare KES ${quote}.`,
      { bookingId: booking.id },
    );
    this.notifications.bookingChanged([customerId, dto.driverId], booking.id, 'REQUESTED');
    return this.get(booking.id, { id: customerId, roles: ['CUSTOMER'] });
  }

  // ------------------------------------------------------------------ read

  async list(user: AuthUser, state?: string) {
    const rows = await this.prisma.booking.findMany({
      where: {
        OR: [
          { customerId: user.id },
          { requestedDriverId: user.id },
          { assignedDriverId: user.id },
        ],
        ...(state ? { state: state as BookingState } : {}),
      },
      include: {
        rideDetails: true,
        customer: { select: { id: true, name: true, phone: true } },
        requestedDriver: driverPublic,
        assignedDriver: driverPublic,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((b) => this.redact(b, user.id));
  }

  async get(id: string, user: AuthUser) {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        rideDetails: true,
        customer: { select: { id: true, name: true, phone: true } },
        requestedDriver: driverPublic,
        assignedDriver: driverPublic,
        referrals: { orderBy: { createdAt: 'desc' }, include: { candidate: driverPublic } },
        events: { orderBy: { createdAt: 'asc' } },
        payment: true,
        review: true,
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (![b.customerId, b.requestedDriverId, b.assignedDriverId].includes(user.id)) {
      throw new ForbiddenException();
    }
    return this.redact(b, user.id);
  }

  /** Customer phone is only revealed to the driver who is actually assigned to the job. */
  private redact<
    T extends { customerId: string; assignedDriverId: string | null; customer: { phone: string } },
  >(b: T, userId: string): T {
    if (b.customerId !== userId && b.assignedDriverId !== userId) {
      return { ...b, customer: { ...b.customer, phone: undefined as unknown as string } };
    }
    return b;
  }

  // ------------------------------------------------------------------ driver actions

  async accept(driverId: string, bookingId: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!b) throw new NotFoundException('Booking not found');
      if (b.requestedDriverId !== driverId)
        throw new ForbiddenException('This request was not sent to you');
      const open = await tx.referral.findFirst({
        where: {
          bookingId,
          state: { in: ['PROPOSED', 'CANDIDATE_ACCEPTED'] },
          expiresAt: { gt: new Date() },
        },
      });
      if (open)
        throw new ConflictException('Cancel the open referral before accepting this job yourself');
      return this.assignInTx(tx, bookingId, driverId, driverId, 'DIRECT');
    });
    await this.afterAssigned(booking.id, booking.customerId, driverId);
    return this.get(bookingId, { id: driverId, roles: ['DRIVER'] });
  }

  /**
   * THE assignment primitive. Concurrency-safe: serialises on the driver row, re-checks eligibility,
   * then flips the booking with a guarded update so exactly one assignment can ever win.
   * Used by direct acceptance and by customer-approved referrals.
   */
  async assignInTx(
    tx: Tx,
    bookingId: string,
    driverId: string,
    actorId: string,
    source: 'DIRECT' | 'REFERRAL',
    opts: { revisedQuote?: number | null } = {},
  ) {
    // Serialise concurrent assignments for the same driver (prevents double-booking).
    await tx.$queryRaw`SELECT 1 FROM "DriverProfile" WHERE "userId" = ${driverId} FOR UPDATE`;
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await this.eligibility.assertEligible(tx, driverId, b.type, b.scheduledAt);

    const res = await tx.booking.updateMany({
      where: {
        id: bookingId,
        state: 'REQUESTED',
        assignedDriverId: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        state: 'ACCEPTED',
        assignedDriverId: driverId,
        ...(opts.revisedQuote ? { quote: opts.revisedQuote } : {}),
      },
    });
    if (res.count === 0) throw new ConflictException('This booking is no longer available');
    await this.event(
      tx,
      bookingId,
      source === 'REFERRAL' ? 'ASSIGNED_VIA_REFERRAL' : 'ACCEPTED',
      actorId,
      {
        driverId,
        ...(opts.revisedQuote ? { revisedQuote: opts.revisedQuote } : {}),
      },
    );
    return b;
  }

  async afterAssigned(bookingId: string, customerId: string, driverId: string) {
    await this.notifications.notify(
      customerId,
      'BOOKING_ACCEPTED',
      'Driver confirmed',
      'Your driver is on the way once the trip starts.',
      { bookingId },
    );
    this.notifications.bookingChanged([customerId, driverId], bookingId, 'ACCEPTED');
  }

  async decline(driverId: string, bookingId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.requestedDriverId !== driverId) throw new ForbiddenException();
    await this.transition(
      bookingId,
      'REQUESTED',
      'DECLINED',
      driverId,
      { assignedDriverId: null },
      'DECLINED',
    );
    await this.cancelOpenReferrals(bookingId);
    await this.notifications.notify(
      b.customerId,
      'BOOKING_DECLINED',
      'Request declined',
      'Your driver is unavailable. You can request another trusted driver.',
      { bookingId },
    );
    this.notifications.bookingChanged([b.customerId, driverId], bookingId, 'DECLINED');
    return this.get(bookingId, { id: driverId, roles: ['DRIVER'] });
  }

  async progress(driverId: string, bookingId: string, to: BookingStateName) {
    if (!DRIVER_PROGRESS_STATES.includes(to)) throw new BadRequestException('Invalid status');
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.assignedDriverId !== driverId)
      throw new ForbiddenException('You are not assigned to this booking');
    const from = b.state as BookingStateName;
    if (!canTransition(from, to))
      throw new BadRequestException(`Cannot move from ${from} to ${to}`);

    await this.transition(
      bookingId,
      from,
      to as BookingStateName,
      driverId,
      { assignedDriverId: driverId },
      to,
      to === 'COMPLETED' ? { completedAt: new Date() } : {},
    );
    await this.notifications.notify(
      b.customerId,
      `BOOKING_${to}`,
      statusTitle(to),
      statusBody(to),
      { bookingId },
    );
    this.notifications.bookingChanged([b.customerId, driverId], bookingId, to);
    return this.get(bookingId, { id: driverId, roles: ['DRIVER'] });
  }

  async cancel(user: AuthUser, bookingId: string, reason?: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    const from = b.state as BookingStateName;
    const isCustomer = b.customerId === user.id;
    const isDriver = b.assignedDriverId === user.id;
    if (!isCustomer && !isDriver) throw new ForbiddenException();
    const allowed = isCustomer ? CUSTOMER_CANCELLABLE : DRIVER_CANCELLABLE;
    if (!allowed.includes(from) || !canTransition(from, 'CANCELLED')) {
      throw new BadRequestException(`A booking in state ${from} can no longer be cancelled`);
    }
    await this.transition(
      bookingId,
      from,
      'CANCELLED',
      user.id,
      {},
      'CANCELLED',
      { cancelledReason: reason ?? null },
      { reason, by: isCustomer ? 'CUSTOMER' : 'DRIVER' },
    );
    await this.cancelOpenReferrals(bookingId);
    const other = isCustomer ? (b.assignedDriverId ?? b.requestedDriverId) : b.customerId;
    await this.notifications.notify(
      other,
      'BOOKING_CANCELLED',
      'Booking cancelled',
      reason ?? 'The booking was cancelled.',
      { bookingId },
    );
    this.notifications.bookingChanged(
      [b.customerId, b.requestedDriverId, b.assignedDriverId],
      bookingId,
      'CANCELLED',
    );
    return this.get(bookingId, user);
  }

  // ------------------------------------------------------------------ internals

  /** Guarded state change: only succeeds if the booking is still in `from`. Writes an immutable event. */
  private async transition(
    bookingId: string,
    from: BookingStateName,
    to: BookingStateName,
    actorId: string,
    extraWhere: Prisma.BookingWhereInput,
    eventType: string,
    extraData: Prisma.BookingUpdateManyMutationInput = {},
    meta?: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: bookingId, state: from as BookingState, ...extraWhere },
        data: { state: to as BookingState, ...extraData },
      });
      if (res.count === 0)
        throw new ConflictException('The booking changed in the meantime. Please refresh.');
      await this.event(tx, bookingId, eventType, actorId, meta);
    });
  }

  private async cancelOpenReferrals(bookingId: string) {
    await this.prisma.referral.updateMany({
      where: { bookingId, state: { in: ['PROPOSED', 'CANDIDATE_ACCEPTED'] } },
      data: { state: 'CANCELLED' },
    });
  }

  private event(
    tx: Tx,
    bookingId: string,
    type: string,
    actorId: string | null,
    metadata?: Record<string, unknown>,
  ) {
    return tx.bookingEvent.create({
      data: {
        bookingId,
        type,
        actorId,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Requests nobody answered in time expire; open referrals on them expire too. */
  @Interval(60_000)
  async expireStale() {
    const stale = await this.prisma.booking.findMany({
      where: { state: 'REQUESTED', expiresAt: { lt: new Date() } },
      select: { id: true, customerId: true, requestedDriverId: true },
      take: 200,
    });
    for (const s of stale) {
      try {
        await this.transition(s.id, 'REQUESTED', 'EXPIRED', 'system', {}, 'EXPIRED');
        await this.prisma.referral.updateMany({
          where: { bookingId: s.id, state: { in: ['PROPOSED', 'CANDIDATE_ACCEPTED'] } },
          data: { state: 'EXPIRED' },
        });
        await this.notifications.notify(
          s.customerId,
          'BOOKING_EXPIRED',
          'Request expired',
          'Your driver did not respond in time.',
          { bookingId: s.id },
        );
        this.notifications.bookingChanged([s.customerId, s.requestedDriverId], s.id, 'EXPIRED');
      } catch {
        /* lost a race with an accept/cancel: that's fine */
      }
    }
  }
}

function statusTitle(s: string) {
  return (
    (
      {
        EN_ROUTE: 'Driver on the way',
        ARRIVED: 'Driver has arrived',
        IN_PROGRESS: 'Trip started',
        COMPLETED: 'Trip completed',
      } as Record<string, string>
    )[s] ?? 'Booking update'
  );
}
function statusBody(s: string) {
  return (
    (
      {
        EN_ROUTE: 'Live tracking is now available for this trip.',
        ARRIVED: 'Your driver is at the pickup point.',
        IN_PROGRESS: 'Enjoy your ride.',
        COMPLETED: 'Please rate your trip. Live tracking has stopped.',
      } as Record<string, string>
    )[s] ?? ''
  );
}

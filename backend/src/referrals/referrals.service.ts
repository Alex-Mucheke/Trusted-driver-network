import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { BookingsService } from '../bookings/bookings.service';
import { orderPair } from '../common/geo';
import { EligibilityService } from '../drivers/eligibility.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const OPEN = ['PROPOSED', 'CANDIDATE_ACCEPTED'] as const;
const ttlMs = () => Number(process.env.REFERRAL_TTL_MINUTES ?? 10) * 60 * 1000;
const maxAttempts = () => Number(process.env.MAX_REFERRAL_ATTEMPTS ?? 3);

const driverPublic = {
  select: {
    id: true,
    name: true,
    driverProfile: {
      select: {
        photoUrl: true,
        verificationStatus: true,
        vehicles: {
          where: { active: true },
          select: { plate: true, type: true, make: true, model: true, color: true, capacity: true },
        },
      },
    },
  },
} as const;

/**
 * Referral state machine (separate from, and linked to, the booking):
 *   PROPOSED -> CANDIDATE_ACCEPTED -> CUSTOMER_APPROVED   (booking assigned atomically here)
 *            -> CANDIDATE_DECLINED | EXPIRED | CANCELLED
 *   CANDIDATE_ACCEPTED -> CUSTOMER_REJECTED | EXPIRED | CANCELLED
 * The booking is NEVER reassigned except by CUSTOMER_APPROVED.
 */
@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private bookings: BookingsService,
    private eligibility: EligibilityService,
    private notifications: NotificationsService,
  ) {}

  private async trustedLink(a: string, b: string) {
    const [x, y] = orderPair(a, b);
    const link = await this.prisma.driverConnection.findUnique({
      where: { driverAId_driverBId: { driverAId: x, driverBId: y } },
    });
    return link?.trustStatus === 'TRUSTED';
  }

  // -------------------------------------------------------------- propose

  async propose(driverId: string, bookingId: string, candidateId: string) {
    await this.expireDue(bookingId);
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.requestedDriverId !== driverId)
      throw new ForbiddenException('Only the requested driver can refer this job');
    if (booking.state !== 'REQUESTED' || booking.assignedDriverId) {
      throw new BadRequestException('Only unassigned, pending requests can be referred');
    }
    if (candidateId === driverId || candidateId === booking.customerId)
      throw new BadRequestException('Invalid candidate');

    if ((await this.prisma.referral.count({ where: { bookingId } })) >= maxAttempts()) {
      throw new BadRequestException('Maximum number of referral attempts reached for this booking');
    }
    const open = await this.prisma.referral.findFirst({
      where: { bookingId, state: { in: [...OPEN] } },
    });
    if (open) throw new ConflictException('There is already an open referral for this booking');

    if (!(await this.trustedLink(driverId, candidateId))) {
      throw new ForbiddenException('You can only refer to drivers in your trusted network');
    }
    const blocked = await this.prisma.customerDriverConnection.findUnique({
      where: { customerId_driverId: { customerId: booking.customerId, driverId: candidateId } },
    });
    if (blocked?.status === 'BLOCKED')
      throw new ForbiddenException('This driver cannot be offered to the customer');

    // Verified + available + offers the service + has a vehicle + no overlapping job.
    await this.eligibility.assertEligible(
      this.prisma,
      candidateId,
      booking.type,
      booking.scheduledAt,
    );

    try {
      const ref = await this.prisma.$transaction(async (tx) => {
        const r = await tx.referral.create({
          data: {
            bookingId,
            proposerId: driverId,
            candidateId,
            expiresAt: new Date(Date.now() + ttlMs()),
          },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId,
            type: 'REFERRAL_PROPOSED',
            actorId: driverId,
            metadata: { referralId: r.id, candidateId },
          },
        });
        return r;
      });
      await this.notifications.notify(
        candidateId,
        'REFERRAL_OFFER',
        'Referred ride request',
        'A colleague referred a ride to you. Respond before it expires.',
        { referralId: ref.id },
      );
      return ref;
    } catch (e) {
      // @@unique([bookingId, candidateId]) -> loops / duplicate offers are impossible
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('This driver was already offered this booking');
      }
      throw e;
    }
  }

  async candidates(driverId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.requestedDriverId !== driverId) throw new ForbiddenException();
    const links = await this.prisma.driverConnection.findMany({
      where: { trustStatus: 'TRUSTED', OR: [{ driverAId: driverId }, { driverBId: driverId }] },
    });
    const already = new Set(
      (
        await this.prisma.referral.findMany({ where: { bookingId }, select: { candidateId: true } })
      ).map((r) => r.candidateId),
    );
    const out = [];
    for (const l of links) {
      const peerId = l.driverAId === driverId ? l.driverBId : l.driverAId;
      if (already.has(peerId) || peerId === booking.customerId) continue;
      if (
        !(await this.eligibility.isEligible(this.prisma, peerId, booking.type, booking.scheduledAt))
      )
        continue;
      out.push(
        await this.prisma.user.findUniqueOrThrow({ where: { id: peerId }, ...driverPublic }),
      );
    }
    return out;
  }

  // -------------------------------------------------------------- candidate

  incoming(candidateId: string) {
    return this.prisma.referral.findMany({
      where: { candidateId, state: 'PROPOSED', expiresAt: { gt: new Date() } },
      include: {
        proposer: { select: { id: true, name: true } },
        booking: {
          select: {
            id: true,
            quote: true,
            scheduledAt: true,
            passengerCount: true,
            rideDetails: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async candidateRespond(
    candidateId: string,
    referralId: string,
    dto: { accept: boolean; etaMinutes?: number; revisedQuote?: number },
  ) {
    const ref = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { booking: true },
    });
    if (!ref || ref.candidateId !== candidateId) throw new NotFoundException('Referral not found');
    const { booking } = ref;

    if (!dto.accept) {
      const r = await this.prisma.referral.updateMany({
        where: { id: referralId, state: 'PROPOSED' },
        data: { state: 'CANDIDATE_DECLINED', candidateRespondedAt: new Date() },
      });
      if (r.count === 0) throw new ConflictException('This referral is no longer pending');
      await this.log(booking.id, 'REFERRAL_DECLINED', candidateId, { referralId });
      await this.notifications.notify(
        ref.proposerId,
        'REFERRAL_DECLINED',
        'Referral declined',
        'Your colleague declined. You can try another driver.',
        { bookingId: booking.id },
      );
      return { ok: true };
    }

    if (booking.state !== 'REQUESTED' || booking.assignedDriverId)
      throw new ConflictException('This booking is no longer available');
    await this.eligibility.assertEligible(
      this.prisma,
      candidateId,
      booking.type,
      booking.scheduledAt,
    );

    let revisedQuote: number | undefined;
    if (dto.revisedQuote && dto.revisedQuote !== booking.quote) {
      const max = Math.round(booking.quote * Number(process.env.MAX_QUOTE_MULTIPLIER ?? 1.5));
      const min = Math.round(booking.quote * 0.5);
      if (dto.revisedQuote > max || dto.revisedQuote < min) {
        throw new BadRequestException(`Revised quote must be between KES ${min} and KES ${max}`);
      }
      revisedQuote = dto.revisedQuote;
    }

    // Guarded update: only one acceptance can ever succeed, and only before expiry.
    const r = await this.prisma.referral.updateMany({
      where: { id: referralId, state: 'PROPOSED', expiresAt: { gt: new Date() } },
      data: {
        state: 'CANDIDATE_ACCEPTED',
        candidateRespondedAt: new Date(),
        etaMinutes: dto.etaMinutes,
        revisedQuote,
        // Customer gets a fresh window to review the replacement.
        expiresAt: new Date(Date.now() + ttlMs()),
      },
    });
    if (r.count === 0) throw new ConflictException('This referral is no longer pending');
    await this.log(booking.id, 'REFERRAL_CANDIDATE_ACCEPTED', candidateId, {
      referralId,
      etaMinutes: dto.etaMinutes,
      revisedQuote,
    });
    await this.notifications.notify(
      booking.customerId,
      'REFERRAL_APPROVAL_NEEDED',
      'Approve replacement driver',
      'Your driver suggested a replacement. Review their details and approve to confirm.',
      { bookingId: booking.id, referralId },
    );
    this.notifications.bookingChanged(
      [booking.customerId, ref.proposerId, candidateId],
      booking.id,
      'REQUESTED',
    );
    return { ok: true };
  }

  // -------------------------------------------------------------- customer

  async customerDecision(customerId: string, referralId: string, approve: boolean) {
    const ref = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { booking: true },
    });
    if (!ref || ref.booking.customerId !== customerId)
      throw new NotFoundException('Referral not found');
    const { booking } = ref;

    if (!approve) {
      const r = await this.prisma.referral.updateMany({
        where: { id: referralId, state: 'CANDIDATE_ACCEPTED' },
        data: { state: 'CUSTOMER_REJECTED', customerRespondedAt: new Date() },
      });
      if (r.count === 0) throw new ConflictException('Nothing to reject');
      // Booking stays REQUESTED with the original driver (returns to the original request flow).
      await this.log(booking.id, 'REFERRAL_CUSTOMER_REJECTED', customerId, { referralId });
      await this.notifications.notify(
        ref.proposerId,
        'REFERRAL_REJECTED',
        'Customer declined the replacement',
        'The request is back with you.',
        { bookingId: booking.id },
      );
      await this.notifications.notify(
        ref.candidateId,
        'REFERRAL_REJECTED',
        'Referral not approved',
        'The customer chose not to proceed.',
        { bookingId: booking.id },
      );
      return { ok: true };
    }

    // Approval + assignment happen in ONE transaction: both succeed or neither does.
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.referral.updateMany({
        where: { id: referralId, state: 'CANDIDATE_ACCEPTED', expiresAt: { gt: new Date() } },
        data: { state: 'CUSTOMER_APPROVED', customerRespondedAt: new Date() },
      });
      if (r.count === 0)
        throw new ConflictException('This referral is no longer awaiting your approval');
      await this.bookings.assignInTx(tx, booking.id, ref.candidateId, customerId, 'REFERRAL', {
        revisedQuote: ref.revisedQuote,
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: 'REFERRAL_CUSTOMER_APPROVED',
          actorId: customerId,
          metadata: { referralId, candidateId: ref.candidateId, proposerId: ref.proposerId },
        },
      });
    });
    await this.bookings.afterAssigned(booking.id, customerId, ref.candidateId);
    await this.notifications.notify(
      ref.candidateId,
      'REFERRAL_CONFIRMED',
      'You have the job',
      'The customer approved you. Head to the pickup point.',
      { bookingId: booking.id },
    );
    await this.notifications.notify(
      ref.proposerId,
      'REFERRAL_CONFIRMED',
      'Referral confirmed',
      'Your colleague was approved and assigned.',
      { bookingId: booking.id },
    );
    return { ok: true };
  }

  async cancel(userId: string, referralId: string) {
    const ref = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { booking: true },
    });
    if (!ref) throw new NotFoundException();
    if (userId !== ref.proposerId && userId !== ref.booking.customerId)
      throw new ForbiddenException();
    const r = await this.prisma.referral.updateMany({
      where: { id: referralId, state: { in: [...OPEN] } },
      data: { state: 'CANCELLED' },
    });
    if (r.count === 0) throw new ConflictException('Referral is no longer open');
    await this.log(ref.bookingId, 'REFERRAL_CANCELLED', userId, { referralId });
    return { ok: true };
  }

  // -------------------------------------------------------------- expiry

  private async expireDue(bookingId?: string) {
    const due = await this.prisma.referral.findMany({
      where: {
        state: { in: [...OPEN] },
        expiresAt: { lt: new Date() },
        ...(bookingId ? { bookingId } : {}),
      },
      include: { booking: { select: { customerId: true } } },
      take: 200,
    });
    for (const r of due) {
      const res = await this.prisma.referral.updateMany({
        where: { id: r.id, state: { in: [...OPEN] } },
        data: { state: 'EXPIRED' },
      });
      if (res.count === 0) continue;
      await this.log(r.bookingId, 'REFERRAL_EXPIRED', null, { referralId: r.id });
      await this.notifications.notify(
        r.proposerId,
        'REFERRAL_EXPIRED',
        'Referral expired',
        'The referral timed out. The request is still with you.',
        { bookingId: r.bookingId },
      );
    }
  }

  @Interval(30_000)
  sweep() {
    return this.expireDue();
  }

  private log(
    bookingId: string,
    type: string,
    actorId: string | null,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.bookingEvent.create({
      data: { bookingId, type, actorId, metadata: metadata as Prisma.InputJsonValue | undefined },
    });
  }
}

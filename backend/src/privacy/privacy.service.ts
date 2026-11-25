import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAY_MS,
  DSR_RESPONSE_DAYS,
  MAX_OPEN_DATA_REQUESTS,
  OPEN_BOOKING_STATES,
  PRIVACY_NOTICE_VERSION,
  REDACTED_MESSAGE,
  SCRUBBED_RIDE,
} from './policy';

export type SelfServiceRequestType = 'CORRECTION' | 'OBJECTION' | 'RESTRICTION';

const EXPORT_LIMIT = 5000;

const requestSelect = {
  id: true,
  type: true,
  status: true,
  note: true,
  resolution: true,
  requestedAt: true,
  dueAt: true,
  completedAt: true,
} as const;

const dueDate = (from: Date) => new Date(from.getTime() + DSR_RESPONSE_DAYS * DAY_MS);

@Injectable()
export class PrivacyService {
  constructor(private prisma: PrismaService) {}

  // ------------------------------------------------------------------ consent

  async consentStatus(userId: string) {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      select: { id: true, type: true, version: true, grantedAt: true, withdrawnAt: true },
    });
    const latest = records.find((r) => r.type === 'PRIVACY_NOTICE' && !r.withdrawnAt);
    return {
      currentVersion: PRIVACY_NOTICE_VERSION,
      privacyNoticeAccepted: latest?.version === PRIVACY_NOTICE_VERSION,
      records,
    };
  }

  /** Records that the user has seen the current notice (used when the text changes). */
  async acceptPrivacyNotice(userId: string) {
    await this.prisma.consentRecord.create({
      data: { userId, type: 'PRIVACY_NOTICE', version: PRIVACY_NOTICE_VERSION },
    });
    return this.consentStatus(userId);
  }

  // ------------------------------------------------------------------ access / portability

  /**
   * Everything we hold about the user in one machine-readable document. Other people's contact
   * details are never included (counterparties appear by name only) and password hashes, storage
   * keys and internal notes are left out.
   */
  async export(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        status: true,
        notificationPrefs: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('Account not found');

    const [
      driverProfile,
      bookings,
      messages,
      notifications,
      reviewsGiven,
      reviewsReceived,
      reportsFiled,
      reportsAgainstCount,
      consents,
      dataRequests,
      customerConnections,
      driverNetwork,
    ] = await Promise.all([
      this.prisma.driverProfile.findUnique({
        where: { userId },
        select: {
          bio: true,
          photoUrl: true,
          shareCode: true,
          serviceArea: true,
          verificationStatus: true,
          verificationNote: true,
          availability: true,
          shareApproxLocation: true,
          approxLat: true,
          approxLng: true,
          approxUpdatedAt: true,
          requireConnectionApproval: true,
          createdAt: true,
          vehicles: {
            select: {
              plate: true,
              type: true,
              make: true,
              model: true,
              color: true,
              capacity: true,
              active: true,
              createdAt: true,
            },
          },
          documents: { select: { kind: true, status: true, reviewNote: true, createdAt: true } },
          services: { select: { serviceType: true, active: true } },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          OR: [{ customerId: userId }, { requestedDriverId: userId }, { assignedDriverId: userId }],
        },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_LIMIT,
        select: {
          id: true,
          type: true,
          state: true,
          quote: true,
          currency: true,
          scheduledAt: true,
          passengerCount: true,
          notes: true,
          cancelledReason: true,
          createdAt: true,
          completedAt: true,
          customer: { select: { name: true } },
          requestedDriver: { select: { name: true } },
          assignedDriver: { select: { name: true } },
          rideDetails: true,
          payment: {
            select: {
              method: true,
              state: true,
              serviceCharge: true,
              itemCost: true,
              platformFee: true,
              tip: true,
              total: true,
              receiptNumber: true,
              paidAt: true,
            },
          },
          events: { where: { actorId: userId }, select: { type: true, createdAt: true } },
        },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_LIMIT,
        select: { bookingId: true, content: true, createdAt: true },
      }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_LIMIT,
        select: { type: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      this.prisma.review.findMany({
        where: { authorId: userId },
        select: { bookingId: true, rating: true, comment: true, createdAt: true },
      }),
      this.prisma.review.findMany({
        where: { driverId: userId },
        select: { rating: true, comment: true, createdAt: true },
      }),
      this.prisma.report.findMany({
        where: { reporterId: userId },
        select: { type: true, status: true, category: true, description: true, createdAt: true },
      }),
      this.prisma.report.count({ where: { targetUserId: userId } }),
      this.prisma.consentRecord.findMany({
        where: { userId },
        orderBy: { grantedAt: 'asc' },
        select: { type: true, version: true, grantedAt: true, withdrawnAt: true },
      }),
      this.prisma.dataRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: 'asc' },
        select: requestSelect,
      }),
      this.prisma.customerDriverConnection.findMany({
        where: { OR: [{ customerId: userId }, { driverId: userId }] },
        select: {
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
          driver: { select: { name: true } },
        },
      }),
      this.prisma.driverConnection.findMany({
        where: { OR: [{ driverAId: userId }, { driverBId: userId }] },
        select: {
          trustStatus: true,
          createdAt: true,
          driverA: { select: { name: true } },
          driverB: { select: { name: true } },
        },
      }),
    ]);

    // The export itself is an access request; log it so the register of requests is complete.
    const now = new Date();
    await this.prisma.dataRequest.create({
      data: {
        userId,
        type: 'ACCESS',
        status: 'COMPLETED',
        requestedAt: now,
        dueAt: dueDate(now),
        completedAt: now,
        resolution: 'Self-service export downloaded.',
      },
    });

    return {
      generatedAt: now.toISOString(),
      noticeVersion: PRIVACY_NOTICE_VERSION,
      note:
        'Contact details of other people are not included. Records we must keep by law (for ' +
        'example payments) or for safety are listed here even if you later delete your account.',
      account: user,
      driverProfile,
      connections: { customerDriver: customerConnections, driverNetwork },
      bookings,
      messagesSent: messages,
      notifications,
      reviewsGiven,
      reviewsReceived,
      reportsFiled,
      reportsAgainstYouCount: reportsAgainstCount,
      consents,
      dataRequests,
    };
  }

  // ------------------------------------------------------------------ erasure

  /**
   * Self-service erasure: requires the password again, then anonymises the account (see
   * `anonymise`).
   */
  async erase(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('Account not found');
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    return this.anonymise(userId, 'SELF');
  }

  /**
   * The account row is kept but anonymised so retained financial, safety and audit records still
   * resolve; everything else that identifies the person is removed or scrubbed. Refuses while
   * bookings are still open and never touches administrator accounts. `by` only changes the
   * wording of the logged resolution.
   */
  async anonymise(userId: string, by: 'SELF' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('Account not found');
    if (user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Administrator accounts must be removed by another administrator',
      );
    }

    const open = await this.prisma.booking.count({
      where: {
        state: { in: [...OPEN_BOOKING_STATES] },
        OR: [{ customerId: userId }, { requestedDriverId: userId }, { assignedDriverId: userId }],
      },
    });
    if (open > 0) {
      throw new ConflictException(
        'There are bookings in progress. They must be cancelled or finished before the account can be deleted.',
      );
    }

    // An unguessable password hash: the anonymised account can never be signed in to.
    const unusableHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.referral.updateMany({
        where: {
          state: { in: ['PROPOSED', 'CANDIDATE_ACCEPTED'] },
          OR: [{ proposerId: userId }, { candidateId: userId }],
        },
        data: { state: 'CANCELLED' },
      });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.customerDriverConnection.deleteMany({
        where: { OR: [{ customerId: userId }, { driverId: userId }] },
      });
      await tx.driverConnection.deleteMany({
        where: { OR: [{ driverAId: userId }, { driverBId: userId }] },
      });
      // Keep the other party's conversation intact but remove what this user wrote.
      await tx.message.updateMany({
        where: { senderId: userId },
        data: { content: REDACTED_MESSAGE },
      });
      await tx.review.updateMany({ where: { authorId: userId }, data: { comment: null } });
      await tx.driverLocation.deleteMany({ where: { driverId: userId } });
      // Cascades to vehicles, verification documents and services.
      await tx.driverProfile.deleteMany({ where: { userId } });
      // Trip addresses, free-text notes and raw payment callbacks (which carry phone numbers).
      await tx.rideDetails.updateMany({
        where: { booking: { customerId: userId } },
        data: { ...SCRUBBED_RIDE },
      });
      await tx.booking.updateMany({
        where: { customerId: userId },
        data: { notes: null, cancelledReason: null },
      });
      await tx.payment.updateMany({
        where: { booking: { customerId: userId } },
        data: { rawCallback: Prisma.DbNull },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Deleted user',
          email: `deleted-${userId}@deleted.invalid`,
          phone: `deleted-${userId}`,
          passwordHash: unusableHash,
          status: 'SUSPENDED',
          deletedAt: now,
          notificationPrefs: Prisma.DbNull,
        },
      });
      await tx.dataRequest.create({
        data: {
          userId,
          type: 'ERASURE',
          status: 'COMPLETED',
          requestedAt: now,
          dueAt: dueDate(now),
          completedAt: now,
          resolution:
            (by === 'SELF' ? 'Self-service erasure' : 'Erasure carried out by an administrator') +
            ': personal data anonymised. Payment, safety-report and audit records are retained ' +
            'as set out in the retention schedule.',
        },
      });
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ other rights

  async createRequest(userId: string, type: SelfServiceRequestType, note?: string) {
    const open = await this.prisma.dataRequest.count({ where: { userId, status: 'OPEN' } });
    if (open >= MAX_OPEN_DATA_REQUESTS) {
      throw new BadRequestException(
        'You already have several open requests. We will respond to those first.',
      );
    }
    return this.prisma.dataRequest.create({
      data: { userId, type, note: note?.trim() || null, dueAt: dueDate(new Date()) },
      select: requestSelect,
    });
  }

  listRequests(userId: string) {
    return this.prisma.dataRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
      select: requestSelect,
    });
  }
}

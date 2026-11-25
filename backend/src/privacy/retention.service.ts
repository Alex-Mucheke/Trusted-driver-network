import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAY_MS,
  REDACTED_TEXT,
  retentionDays,
  SCRUBBED_RIDE,
  TERMINAL_BOOKING_STATES,
} from './policy';

export interface RetentionResult {
  notificationsDeleted: number;
  messagesDeleted: number;
  rideDetailsScrubbed: number;
  bookingNotesCleared: number;
  paymentCallbacksCleared: number;
}

/**
 * Storage limitation (Data Protection Act s.39): personal data is deleted or scrubbed once it is
 * no longer needed. Periods are drafts (see policy.ts and docs/compliance/retention-schedule.md)
 * and can be tuned with env vars. Every step is idempotent, so running it on several API
 * instances, or twice in a row, is harmless. Raw driver GPS is purged separately every 5 minutes
 * by LocationsService.
 */
@Injectable()
export class RetentionService {
  private readonly log = new Logger(RetentionService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('15 3 * * *', { timeZone: 'Africa/Nairobi' })
  async scheduled() {
    try {
      const result = await this.run();
      this.log.log({ msg: 'retention run complete', ...result });
    } catch (err) {
      this.log.error({
        msg: 'retention run failed',
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  async run(now: Date = new Date()): Promise<RetentionResult> {
    const cutoff = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const terminal = [...TERMINAL_BOOKING_STATES];

    const notifications = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff(retentionDays('NOTIFICATION_RETENTION_DAYS')) } },
    });

    const messages = await this.prisma.message.deleteMany({
      where: {
        createdAt: { lt: cutoff(retentionDays('MESSAGE_RETENTION_DAYS')) },
        booking: { state: { in: terminal } },
      },
    });

    const rideCutoff = cutoff(retentionDays('RIDE_DETAILS_RETENTION_DAYS'));
    // Ride addresses first: clearing booking notes below bumps Booking.updatedAt.
    const rideDetails = await this.prisma.rideDetails.updateMany({
      where: {
        pickupAddress: { not: REDACTED_TEXT },
        booking: { state: { in: terminal }, updatedAt: { lt: rideCutoff } },
      },
      data: { ...SCRUBBED_RIDE },
    });
    const bookingNotes = await this.prisma.booking.updateMany({
      where: {
        state: { in: terminal },
        updatedAt: { lt: rideCutoff },
        OR: [{ notes: { not: null } }, { cancelledReason: { not: null } }],
      },
      data: { notes: null, cancelledReason: null },
    });

    const callbacks = await this.prisma.payment.updateMany({
      where: {
        rawCallback: { not: Prisma.DbNull },
        updatedAt: { lt: cutoff(retentionDays('PAYMENT_CALLBACK_RETENTION_DAYS')) },
      },
      data: { rawCallback: Prisma.DbNull },
    });

    return {
      notificationsDeleted: notifications.count,
      messagesDeleted: messages.count,
      rideDetailsScrubbed: rideDetails.count,
      bookingNotesCleared: bookingNotes.count,
      paymentCallbacksCleared: callbacks.count,
    };
  }
}

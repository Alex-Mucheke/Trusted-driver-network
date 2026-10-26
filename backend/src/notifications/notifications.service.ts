import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, @Optional() private realtime?: RealtimeGateway) {}

  /**
   * Persists a notification and pushes it over the socket. Never throws: a failed notification
   * must not roll back or fail the business operation that triggered it.
   * Push/SMS delivery with retries plugs in here (Phase 6+).
   */
  async notify(userId: string, type: string, title: string, body: string, data?: Record<string, unknown>) {
    try {
      const n = await this.prisma.notification.create({
        data: { userId, type, title, body, data: (data ?? undefined) as Prisma.InputJsonValue | undefined },
      });
      this.realtime?.emitToUser(userId, 'notification', n);
    } catch {
      /* swallowed on purpose */
    }
  }

  /** Lightweight realtime ping so open screens refresh a booking. */
  bookingChanged(userIds: Array<string | null | undefined>, bookingId: string, state: string) {
    for (const id of new Set(userIds.filter((x): x is string => !!x))) {
      this.realtime?.emitToUser(id, 'booking:update', { bookingId, state });
    }
  }
}

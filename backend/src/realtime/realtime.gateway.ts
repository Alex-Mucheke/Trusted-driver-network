import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { COOKIE_NAME } from '../auth/jwt.strategy';
import { AuthUser } from '../common/decorators';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Single authenticated Socket.IO gateway.
 *  - every socket joins `user:<id>` (notifications, booking updates)
 *  - drivers push `location:update` for an ACTIVE assigned booking
 *  - customers `location:subscribe` to a booking they own; authorization is re-checked on the server
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private locations: LocationsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        readCookie(client.handshake.headers.cookie, COOKIE_NAME) ??
        (client.handshake.auth?.token as string | undefined);
      if (!token) throw new Error('missing token');
      const payload = this.jwt.verify<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, roles: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') throw new Error('inactive');
      client.data.user = { id: user.id, roles: user.roles } as AuthUser;
      await client.join(`user:${user.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  @SubscribeMessage('location:update')
  async onLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { bookingId: string; lat: number; lng: number; accuracy?: number; capturedAt?: string },
  ) {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return { ok: false, error: 'unauthenticated' };
    try {
      const out = await this.locations.ingest(user.id, body);
      if (out) this.emitToUser(out.customerId, 'location:update', out.payload);
      return { ok: true, throttled: !out };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  @SubscribeMessage('location:subscribe')
  async onSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { bookingId: string }) {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return { ok: false, error: 'unauthenticated' };
    try {
      await this.locations.authorizeSubscription(user.id, body.bookingId);
      await client.join(`booking-track:${body.bookingId}`);
      const latest = await this.locations.latestForBooking(user.id, body.bookingId);
      return { ok: true, latest };
    } catch (e) {
      this.logger.debug(`subscribe denied: ${(e as Error).message}`);
      return { ok: false, error: 'not authorized for this booking' };
    }
  }
}

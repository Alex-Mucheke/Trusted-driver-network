import { BadRequestException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { orderPair } from '../common/geo';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const driverCard = {
  select: {
    id: true,
    name: true,
    driverProfile: {
      select: {
        photoUrl: true, serviceArea: true, availability: true, verificationStatus: true,
        shareApproxLocation: true, shareCode: true,
        vehicles: { where: { active: true }, select: { plate: true, type: true, make: true, model: true, color: true } },
      },
    },
  },
} as const;

@Controller('connections')
export class ConnectionsController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ===================== customer <-> driver =====================

  /** Customer follows a driver via the shareable link / QR code. */
  @Roles('CUSTOMER')
  @Post('customer/connect/:shareCode')
  async connect(@CurrentUser() user: AuthUser, @Param('shareCode') shareCode: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { shareCode: shareCode.toUpperCase() } });
    if (!profile || profile.verificationStatus !== 'APPROVED') throw new NotFoundException('Driver not found');
    if (profile.userId === user.id) throw new BadRequestException('You cannot connect to yourself');

    const existing = await this.prisma.customerDriverConnection.findUnique({
      where: { customerId_driverId: { customerId: user.id, driverId: profile.userId } },
    });
    // A driver-side block can never be undone by the customer.
    if (existing?.status === 'BLOCKED') throw new ForbiddenException('This connection is not available');
    if (existing?.status === 'ACTIVE') return existing;

    const status = profile.requireConnectionApproval ? 'PENDING' : 'ACTIVE';
    const conn = await this.prisma.customerDriverConnection.upsert({
      where: { customerId_driverId: { customerId: user.id, driverId: profile.userId } },
      update: { status },
      create: { customerId: user.id, driverId: profile.userId, status },
    });
    if (status === 'PENDING') {
      await this.notifications.notify(profile.userId, 'CONNECTION_REQUEST', 'New connection request', 'A customer wants to add you as a trusted driver.');
    }
    return conn;
  }

  @Roles('CUSTOMER')
  @Get('customer')
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.customerDriverConnection.findMany({
      where: { customerId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
      include: { driver: driverCard },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('CUSTOMER')
  @Delete('customer/:driverId')
  async disconnect(@CurrentUser() user: AuthUser, @Param('driverId') driverId: string) {
    await this.prisma.customerDriverConnection.updateMany({
      where: { customerId: user.id, driverId, status: { in: ['ACTIVE', 'PENDING'] } },
      data: { status: 'DISCONNECTED' },
    });
    return { ok: true };
  }

  @Roles('CUSTOMER')
  @Post('customer/:driverId/block')
  async block(@CurrentUser() user: AuthUser, @Param('driverId') driverId: string) {
    await this.prisma.customerDriverConnection.upsert({
      where: { customerId_driverId: { customerId: user.id, driverId } },
      update: { status: 'BLOCKED' },
      create: { customerId: user.id, driverId, status: 'BLOCKED' },
    });
    return { ok: true };
  }

  // ---- driver side of the customer relationship ----

  @Roles('DRIVER')
  @Get('driver/customers')
  customers(@CurrentUser() user: AuthUser) {
    return this.prisma.customerDriverConnection.findMany({
      where: { driverId: user.id, status: { in: ['ACTIVE', 'PENDING'] } },
      // Name only; contact details are shared per accepted booking.
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('DRIVER')
  @Post('driver/customers/:customerId/approve')
  async approveCustomer(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    const r = await this.prisma.customerDriverConnection.updateMany({
      where: { customerId, driverId: user.id, status: 'PENDING' },
      data: { status: 'ACTIVE' },
    });
    if (r.count === 0) throw new NotFoundException('No pending request');
    await this.notifications.notify(customerId, 'CONNECTION_APPROVED', 'Connection approved', 'You can now book your trusted driver.');
    return { ok: true };
  }

  @Roles('DRIVER')
  @Post('driver/customers/:customerId/reject')
  async rejectCustomer(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    await this.prisma.customerDriverConnection.updateMany({
      where: { customerId, driverId: user.id, status: 'PENDING' },
      data: { status: 'DISCONNECTED' },
    });
    return { ok: true };
  }

  @Roles('DRIVER')
  @Post('driver/customers/:customerId/block')
  async blockCustomer(@CurrentUser() user: AuthUser, @Param('customerId') customerId: string) {
    await this.prisma.customerDriverConnection.upsert({
      where: { customerId_driverId: { customerId, driverId: user.id } },
      update: { status: 'BLOCKED' },
      create: { customerId, driverId: user.id, status: 'BLOCKED' },
    });
    return { ok: true };
  }

  // ===================== driver <-> driver (professional trusted network) =====================

  @Roles('DRIVER')
  @Post('drivers/request/:shareCode')
  async requestPeer(@CurrentUser() user: AuthUser, @Param('shareCode') shareCode: string) {
    const peer = await this.prisma.driverProfile.findUnique({ where: { shareCode: shareCode.toUpperCase() } });
    if (!peer) throw new NotFoundException('Driver not found');
    if (peer.userId === user.id) throw new BadRequestException('You cannot connect to yourself');
    const [a, b] = orderPair(user.id, peer.userId);
    const existing = await this.prisma.driverConnection.findUnique({ where: { driverAId_driverBId: { driverAId: a, driverBId: b } } });
    if (existing && existing.trustStatus !== 'REVOKED') return existing;
    const link = await this.prisma.driverConnection.upsert({
      where: { driverAId_driverBId: { driverAId: a, driverBId: b } },
      update: { trustStatus: 'PENDING', requestedBy: user.id },
      create: { driverAId: a, driverBId: b, requestedBy: user.id, trustStatus: 'PENDING' },
    });
    await this.notifications.notify(peer.userId, 'PEER_REQUEST', 'Trusted driver request', 'A fellow driver wants to add you to their trusted network.');
    return link;
  }

  @Roles('DRIVER')
  @Get('drivers')
  async peers(@CurrentUser() user: AuthUser) {
    const links = await this.prisma.driverConnection.findMany({
      where: { OR: [{ driverAId: user.id }, { driverBId: user.id }], trustStatus: { in: ['PENDING', 'TRUSTED'] } },
      include: { driverA: driverCard, driverB: driverCard },
    });
    return links.map((l) => ({
      id: l.id,
      trustStatus: l.trustStatus,
      requestedByMe: l.requestedBy === user.id,
      peer: l.driverAId === user.id ? l.driverB : l.driverA,
    }));
  }

  @Roles('DRIVER')
  @Post('drivers/:peerId/accept')
  async acceptPeer(@CurrentUser() user: AuthUser, @Param('peerId') peerId: string) {
    const [a, b] = orderPair(user.id, peerId);
    const link = await this.prisma.driverConnection.findUnique({ where: { driverAId_driverBId: { driverAId: a, driverBId: b } } });
    if (!link || link.trustStatus !== 'PENDING' || link.requestedBy === user.id) throw new NotFoundException('No pending request');
    await this.prisma.driverConnection.update({ where: { id: link.id }, data: { trustStatus: 'TRUSTED' } });
    await this.notifications.notify(peerId, 'PEER_ACCEPTED', 'Trusted driver added', 'Your trusted driver request was accepted.');
    return { ok: true };
  }

  @Roles('DRIVER')
  @Delete('drivers/:peerId')
  async revokePeer(@CurrentUser() user: AuthUser, @Param('peerId') peerId: string) {
    const [a, b] = orderPair(user.id, peerId);
    await this.prisma.driverConnection.updateMany({
      where: { driverAId: a, driverBId: b },
      data: { trustStatus: 'REVOKED' },
    });
    return { ok: true };
  }
}

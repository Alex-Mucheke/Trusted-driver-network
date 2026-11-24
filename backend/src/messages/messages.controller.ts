import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(1000) content: string;
}

@Controller('bookings/:bookingId/messages')
export class MessagesController {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private realtime: RealtimeGateway,
  ) {}

  /** Chat is limited to the customer and the ASSIGNED driver of a booking. */
  private async participants(bookingId: string, userId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true, assignedDriverId: true, state: true },
    });
    if (!b) throw new NotFoundException();
    if (!b.assignedDriverId) throw new BadRequestException('Chat opens once a driver is assigned');
    if (userId !== b.customerId && userId !== b.assignedDriverId) throw new ForbiddenException();
    return { b, other: userId === b.customerId ? b.assignedDriverId : b.customerId };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    await this.participants(bookingId, user.id);
    return this.prisma.message.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  @Post()
  async send(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: SendMessageDto,
  ) {
    const { other } = await this.participants(bookingId, user.id);
    const m = await this.prisma.message.create({
      data: { bookingId, senderId: user.id, content: dto.content.trim() },
    });
    this.realtime.emitToUser(other, 'message', m);
    await this.notifications.notify(other, 'MESSAGE', 'New message', dto.content.slice(0, 80), {
      bookingId,
    });
    return m;
  }
}

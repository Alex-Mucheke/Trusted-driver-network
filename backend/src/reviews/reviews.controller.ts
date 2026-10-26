import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, NotFoundException, Post } from '@nestjs/common';
import { Prisma, ReportType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class ReviewDto {
  @IsUUID() bookingId: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

class ReportDto {
  @IsOptional() @IsEnum(ReportType) type?: ReportType;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsUUID() targetUserId?: string;
  @IsString() @MinLength(2) @MaxLength(60) category: string;
  @IsString() @MinLength(5) @MaxLength(2000) description: string;
}

@Controller()
export class ReviewsController {
  constructor(private prisma: PrismaService) {}

  /** Only the customer of a COMPLETED booking can rate the driver who actually served it. */
  @Roles('CUSTOMER')
  @Post('reviews')
  async review(@CurrentUser() user: AuthUser, @Body() dto: ReviewDto) {
    const b = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customerId !== user.id) throw new ForbiddenException();
    if (b.state !== 'COMPLETED' || !b.assignedDriverId) throw new BadRequestException('Only completed trips can be reviewed');
    try {
      return await this.prisma.review.create({
        data: { bookingId: b.id, authorId: user.id, driverId: b.assignedDriverId, rating: dto.rating, comment: dto.comment },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You already reviewed this trip');
      throw e;
    }
  }

  /** Any participant can report a user or incident; admins triage them. */
  @Post('reports')
  async report(@CurrentUser() user: AuthUser, @Body() dto: ReportDto) {
    if (dto.bookingId) {
      const b = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
      if (!b || ![b.customerId, b.requestedDriverId, b.assignedDriverId].includes(user.id)) throw new ForbiddenException();
    }
    if (!dto.bookingId && !dto.targetUserId) throw new BadRequestException('Provide a booking or a user to report');
    return this.prisma.report.create({
      data: {
        type: dto.type ?? 'REPORT', reporterId: user.id, targetUserId: dto.targetUserId, bookingId: dto.bookingId,
        category: dto.category, description: dto.description,
      },
    });
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { DocumentKind, ServiceType, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { approximate } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';

class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsString() @MaxLength(120) serviceArea?: string;
  @IsOptional() @IsBoolean() requireConnectionApproval?: boolean;
}

class AvailabilityDto {
  @IsIn(['ONLINE', 'OFFLINE']) availability: 'ONLINE' | 'OFFLINE';
  /** Driver consent to show an approximate (~1 km) area to connected customers. */
  @IsOptional() @IsBoolean() shareApproxLocation?: boolean;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

class ServiceItemDto {
  @IsEnum(ServiceType) serviceType: ServiceType;
  @IsBoolean() active: boolean;
}
class ServicesDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  services: ServiceItemDto[];
}

class VehicleDto {
  @IsString() @MinLength(3) @MaxLength(12) plate: string;
  @IsEnum(VehicleType) type: VehicleType;
  @IsString() @MaxLength(40) make: string;
  @IsString() @MaxLength(40) model: string;
  @IsString() @MaxLength(30) color: string;
  @IsInt() @Min(1) @Max(60) capacity: number;
}

class DocumentDto {
  @IsEnum(DocumentKind) kind: DocumentKind;
  /** Key of an object already uploaded to the private bucket (signed-URL upload flow). */
  @IsString() @MaxLength(300) storageKey: string;
  @IsOptional() @IsString() vehicleId?: string;
}

@Controller('drivers')
export class DriversController {
  constructor(private prisma: PrismaService) {}

  // ---------- public (share link / QR) ----------

  @Public()
  @Get('public/:shareCode')
  async publicProfile(@Param('shareCode') shareCode: string) {
    const p = await this.prisma.driverProfile.findUnique({
      where: { shareCode: shareCode.toUpperCase() },
      include: {
        user: { select: { id: true, name: true } },
        vehicles: {
          where: { active: true },
          select: { plate: true, type: true, make: true, model: true, color: true, capacity: true },
        },
        services: { where: { active: true }, select: { serviceType: true } },
      },
    });
    // Only verified drivers are discoverable.
    if (!p || p.verificationStatus !== 'APPROVED') throw new NotFoundException('Driver not found');
    const rating = await this.prisma.review.aggregate({
      where: { driverId: p.userId },
      _avg: { rating: true },
      _count: true,
    });
    return {
      id: p.userId,
      name: p.user.name,
      photoUrl: p.photoUrl,
      bio: p.bio,
      serviceArea: p.serviceArea,
      verified: true,
      availability: p.availability,
      requireConnectionApproval: p.requireConnectionApproval,
      vehicles: p.vehicles,
      services: p.services.map((s) => s.serviceType),
      rating: { average: rating._avg.rating, count: rating._count },
      shareCode: p.shareCode,
    };
  }

  // ---------- driver self-service ----------

  @Roles('DRIVER')
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const p = await this.prisma.driverProfile.findUnique({
      where: { userId: user.id },
      include: { vehicles: true, services: true, documents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!p) throw new NotFoundException();
    const base = process.env.APP_URL ?? 'http://localhost:5173';
    return { ...p, shareLink: `${base}/d/${p.shareCode}` };
  }

  @Roles('DRIVER')
  @Put('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.prisma.driverProfile.update({ where: { userId: user.id }, data: dto });
  }

  @Roles('DRIVER')
  @Put('me/availability')
  async setAvailability(@CurrentUser() user: AuthUser, @Body() dto: AvailabilityDto) {
    const profile = await this.prisma.driverProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    if (dto.availability === 'ONLINE' && profile.verificationStatus !== 'APPROVED') {
      throw new BadRequestException('Only verified drivers can go online');
    }
    const share = dto.shareApproxLocation ?? profile.shareApproxLocation;
    const hasCoords = typeof dto.lat === 'number' && typeof dto.lng === 'number';
    return this.prisma.driverProfile.update({
      where: { userId: user.id },
      data: {
        availability: dto.availability,
        shareApproxLocation: share,
        // Only rounded coordinates are stored, and only with consent.
        approxLat:
          share && hasCoords && dto.availability === 'ONLINE' ? approximate(dto.lat!) : null,
        approxLng:
          share && hasCoords && dto.availability === 'ONLINE' ? approximate(dto.lng!) : null,
        approxUpdatedAt: share && hasCoords ? new Date() : null,
      },
      select: { availability: true, shareApproxLocation: true },
    });
  }

  @Roles('DRIVER')
  @Put('me/services')
  async setServices(@CurrentUser() user: AuthUser, @Body() dto: ServicesDto) {
    await this.prisma.$transaction(
      dto.services.map((s) =>
        this.prisma.driverService.upsert({
          where: { driverId_serviceType: { driverId: user.id, serviceType: s.serviceType } },
          update: { active: s.active },
          create: { driverId: user.id, serviceType: s.serviceType, active: s.active },
        }),
      ),
    );
    return this.prisma.driverService.findMany({ where: { driverId: user.id } });
  }

  @Roles('DRIVER')
  @Post('me/vehicles')
  addVehicle(@CurrentUser() user: AuthUser, @Body() dto: VehicleDto) {
    return this.prisma.vehicle.create({
      data: {
        ...dto,
        plate: dto.plate.toUpperCase().replace(/\s+/g, ' ').trim(),
        driverId: user.id,
      },
    });
  }

  @Roles('DRIVER')
  @Delete('me/vehicles/:id')
  async deactivateVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.vehicle.updateMany({
      where: { id, driverId: user.id },
      data: { active: false },
    });
    return { ok: true };
  }

  /** Registers metadata for a document uploaded to private storage; admins review it. */
  @Roles('DRIVER')
  @Post('me/documents')
  async addDocument(@CurrentUser() user: AuthUser, @Body() dto: DocumentDto) {
    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, driverId: user.id },
      });
      if (!v) throw new BadRequestException('Unknown vehicle');
    }
    // Resubmitting after a rejection puts the profile back in the review queue.
    await this.prisma.driverProfile.updateMany({
      where: { userId: user.id, verificationStatus: 'REJECTED' },
      data: { verificationStatus: 'PENDING', verificationNote: null },
    });
    return this.prisma.verificationDocument.create({ data: { ...dto, driverId: user.id } });
  }
}

import { ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlaceDto {
  @IsString() @MaxLength(200) address: string;
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

export class CreateBookingDto {
  @IsUUID() driverId: string;
  @IsEnum(ServiceType) type: ServiceType;
  @ValidateNested() @Type(() => PlaceDto) pickup: PlaceDto;
  @ValidateNested() @Type(() => PlaceDto) dropoff: PlaceDto;
  @IsOptional() @IsInt() @Min(1) @Max(12) passengerCount?: number;
  /** Omit for an immediate ride. */
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class UpdateStatusDto {
  @IsIn(['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'])
  state: 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';
}

export class CancelDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

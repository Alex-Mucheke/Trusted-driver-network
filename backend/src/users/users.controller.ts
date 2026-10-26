import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class NotificationPrefsDto {
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
}

class UpdateMeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @Matches(/^\+?[0-9]{9,15}$/) phone?: string;
  @IsOptional() @ValidateNested() @Type(() => NotificationPrefsDto) notificationPrefs?: NotificationPrefsDto;
}

const select = { id: true, name: true, email: true, phone: true, roles: true, notificationPrefs: true } as const;

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select });
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: { name: dto.name, phone: dto.phone, notificationPrefs: dto.notificationPrefs as object | undefined },
      select,
    });
  }
}

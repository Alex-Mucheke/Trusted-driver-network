import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ReferralsService } from './referrals.service';

class ProposeDto {
  @IsUUID() bookingId: string;
  @IsUUID() candidateId: string;
}

class CandidateResponseDto {
  @IsBoolean() accept: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(240) etaMinutes?: number;
  /** Optional re-quote in whole KES, validated against the server estimate. */
  @IsOptional() @IsInt() @Min(1) revisedQuote?: number;
}

class CustomerResponseDto {
  @IsBoolean() approve: boolean;
}

@Controller('referrals')
export class ReferralsController {
  constructor(private referrals: ReferralsService) {}

  /** Busy driver proposes a connected, verified colleague for one of their requests. */
  @Roles('DRIVER')
  @Post()
  propose(@CurrentUser() user: AuthUser, @Body() dto: ProposeDto) {
    return this.referrals.propose(user.id, dto.bookingId, dto.candidateId);
  }

  /** Colleagues the driver could refer this booking to (eligible right now). */
  @Roles('DRIVER')
  @Get('candidates/:bookingId')
  candidates(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.referrals.candidates(user.id, bookingId);
  }

  @Roles('DRIVER')
  @Get('incoming')
  incoming(@CurrentUser() user: AuthUser) {
    return this.referrals.incoming(user.id);
  }

  @Roles('DRIVER')
  @Post(':id/respond')
  candidateRespond(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CandidateResponseDto) {
    return this.referrals.candidateRespond(user.id, id, dto);
  }

  /** Customer explicitly approves (or rejects) the replacement. Only approval assigns the new driver. */
  @Roles('CUSTOMER')
  @Post(':id/decision')
  customerDecision(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerResponseDto) {
    return this.referrals.customerDecision(user.id, id, dto.approve);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.referrals.cancel(user.id, id);
  }
}

import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { clearCookieOptions } from '../auth/cookie';
import { COOKIE_NAME } from '../auth/jwt.strategy';
import { AuthUser, CurrentUser } from '../common/decorators';
import { CreateDataRequestDto, EraseAccountDto } from './privacy.dto';
import { PrivacyService } from './privacy.service';

/** Data-subject rights for the signed-in user (Data Protection Act, 2019). */
@ApiTags('privacy')
@Controller('users/me')
export class PrivacyController {
  constructor(private privacy: PrivacyService) {}

  @Get('consents')
  consents(@CurrentUser() user: AuthUser) {
    return this.privacy.consentStatus(user.id);
  }

  /** Acknowledge the current privacy notice (shown again whenever its version changes). */
  @Post('consents')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser) {
    return this.privacy.acceptPrivacyNotice(user.id);
  }

  @Get('data-requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.privacy.listRequests(user.id);
  }

  /** Correction, objection or restriction: handled by an administrator within the 30-day target. */
  @Post('data-requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateDataRequestDto) {
    return this.privacy.createRequest(user.id, dto.type, dto.note);
  }

  /** Download everything we hold about you as JSON. */
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const data = await this.privacy.export(user.id);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="tdn-my-data-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return data;
  }

  /** Permanently delete (anonymise) the account. Needs the password and the word DELETE. */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('erase')
  async erase(
    @CurrentUser() user: AuthUser,
    @Body() dto: EraseAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.privacy.erase(user.id, dto.password);
    res.clearCookie(COOKIE_NAME, clearCookieOptions());
    return result;
  }
}

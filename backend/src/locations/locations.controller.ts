import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private locations: LocationsService) {}

  /** Approximate availability of my connected drivers (never precise positions). */
  @Roles('CUSTOMER')
  @Get('approx')
  approx(@CurrentUser() user: AuthUser) {
    return this.locations.approximateForCustomer(user.id);
  }

  /** Polling fallback for live tracking when the socket is unavailable. */
  @Roles('CUSTOMER')
  @Get('booking/:bookingId/latest')
  latest(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.locations.latestForBooking(user.id, bookingId);
  }
}

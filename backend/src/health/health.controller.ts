import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Does not touch dependencies. */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: the API can serve traffic (database reachable). */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks the database)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
  }
}

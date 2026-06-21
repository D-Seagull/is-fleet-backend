import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Public endpoint — no JwtGuard. Render's health check and any external
  // uptime monitor (UptimeRobot, BetterStack, etc.) hit this. Returns 200
  // when the DB ping succeeds, 503 otherwise so monitors can page on a
  // real outage instead of silently green-lighting a half-dead service.
  @Get()
  @HttpCode(200)
  async check() {
    const startedAt = Date.now();
    let database:
      | { status: 'up'; latencyMs: number }
      | { status: 'down'; error: string };

    try {
      const t0 = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      database = { status: 'up', latencyMs: Date.now() - t0 };
    } catch (err) {
      database = {
        status: 'down',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const body = {
      status: database.status === 'up' ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      tookMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      checks: { database },
    };

    if (database.status === 'down') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}

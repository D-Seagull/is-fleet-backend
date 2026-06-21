import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('DB connected, warming pool...');

    // Pre-warm the pgbouncer pool so the first user request doesn't pay
    // for the TLS handshake + bouncer connect (~200-500ms on a remote
    // Supabase). Fires a handful of cheap queries in parallel — Prisma's
    // pool will hold the resulting connections ready for real traffic.
    const t0 = Date.now();
    const warmupCount = 5;
    await Promise.all(
      Array.from({ length: warmupCount }, () => this.$queryRaw`SELECT 1`),
    ).catch((err: unknown) => {
      this.logger.warn(`Pool warmup failed: ${(err as Error)?.message ?? err}`);
    });
    this.logger.log(`Pool warmed (${warmupCount} conns) in ${Date.now() - t0}ms`);
  }
}

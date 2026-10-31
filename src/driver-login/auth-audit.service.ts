import { Injectable, Logger } from '@nestjs/common';
import { AuthAuditAction, OtpChannel } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface AuthAuditEntry {
  action: AuthAuditAction;
  companyId?: string | null;
  driverId?: string | null;
  /** Who acted: the manager for MANAGER codes, otherwise the driver. */
  actorId?: string | null;
  channel?: OtpChannel | null;
  ip?: string | null;
}

/**
 * Writes AuthAuditLog rows (driver sign-in: codes issued / used, email
 * confirmation). Admin / teamlead read it later; no UI yet. A failed write is
 * logged and swallowed — auditing must never block a sign-in.
 */
@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(entry: AuthAuditEntry): Promise<void> {
    try {
      await this.prisma.authAuditLog.create({
        data: {
          action: entry.action,
          companyId: entry.companyId ?? null,
          driverId: entry.driverId ?? null,
          actorId: entry.actorId ?? null,
          channel: entry.channel ?? null,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit ${entry.action} for driver ${entry.driverId ?? '-'} not written: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

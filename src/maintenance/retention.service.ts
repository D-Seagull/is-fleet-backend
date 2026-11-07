import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';

const DAY_MS = 24 * 3600 * 1000;

// How long each kind of short-lived row is kept after it stops being useful.
// Sign-in codes and tokens carry phone numbers / are credentials: one day of
// slack (a code that expired a minute ago may still be asked about), no more.
const CREDENTIAL_GRACE_MS = 1 * DAY_MS;
// Transfer requests are history of who asked whom — a month.
const TRANSFER_KEEP_MS = 30 * DAY_MS;
// The audit trail itself stays (who issued / used a login code, when); only
// the IP address — personal data — is dropped after this long.
const AUDIT_IP_KEEP_MS = 90 * DAY_MS;

export interface RetentionResult {
  otpCodes: number;
  refreshTokens: number;
  passwordResetTokens: number;
  driverTransfers: number;
  auditIps: number;
}

/**
 * Nightly purge of rows nobody needs any more (audit P1-12). Without it OTP
 * rows (with phone numbers), dead refresh tokens, spent reset tokens, old
 * transfer requests and sign-in IP addresses pile up forever.
 *
 * Each step runs on its own: one failing doesn't skip the rest.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private running = false;

  constructor(private prisma: PrismaService) {}

  @Cron('15 3 * * *')
  nightly() {
    return this.purgeAll();
  }

  async purgeAll(now: Date = new Date()): Promise<RetentionResult> {
    const result: RetentionResult = {
      otpCodes: 0,
      refreshTokens: 0,
      passwordResetTokens: 0,
      driverTransfers: 0,
      auditIps: 0,
    };
    if (this.running) return result;
    this.running = true;
    try {
      const credentialCutoff = new Date(now.getTime() - CREDENTIAL_GRACE_MS);
      const transferCutoff = new Date(now.getTime() - TRANSFER_KEEP_MS);
      const auditCutoff = new Date(now.getTime() - AUDIT_IP_KEEP_MS);

      result.otpCodes = await this.step(
        'otp codes',
        async () =>
          (
            await this.prisma.otpCode.deleteMany({
              where: {
                OR: [
                  { expiresAt: { lt: credentialCutoff } },
                  { usedAt: { lt: credentialCutoff } },
                ],
              },
            })
          ).count,
      );

      // A revoked token stays usable for the 60 s rotation grace window, so
      // "a day after revoking / expiry" is far past any use.
      result.refreshTokens = await this.step(
        'refresh tokens',
        async () =>
          (
            await this.prisma.refreshToken.deleteMany({
              where: {
                OR: [
                  { expiresAt: { lt: credentialCutoff } },
                  { revokedAt: { lt: credentialCutoff } },
                ],
              },
            })
          ).count,
      );

      result.passwordResetTokens = await this.step(
        'reset tokens',
        async () =>
          (
            await this.prisma.passwordResetToken.deleteMany({
              where: {
                OR: [
                  { expiresAt: { lt: credentialCutoff } },
                  { usedAt: { lt: credentialCutoff } },
                ],
              },
            })
          ).count,
      );

      result.driverTransfers = await this.step(
        'driver transfers',
        async () =>
          (
            await this.prisma.driverTransfer.deleteMany({
              where: {
                OR: [
                  { expiresAt: { lt: transferCutoff } },
                  { acceptedAt: { lt: transferCutoff } },
                  { declinedAt: { lt: transferCutoff } },
                ],
              },
            })
          ).count,
      );

      result.auditIps = await this.step(
        'audit IPs',
        async () =>
          (
            await this.prisma.authAuditLog.updateMany({
              where: { createdAt: { lt: auditCutoff }, ip: { not: null } },
              data: { ip: null },
            })
          ).count,
      );

      const total = Object.values(result).reduce((a, b) => a + b, 0);
      if (total > 0) {
        this.logger.log(
          `purged ${result.otpCodes} OTP, ${result.refreshTokens} refresh, ` +
            `${result.passwordResetTokens} reset, ${result.driverTransfers} transfer rows; ` +
            `cleared ${result.auditIps} audit IPs`,
        );
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async step(
    label: string,
    run: () => Promise<number>,
  ): Promise<number> {
    try {
      return await run();
    } catch (e) {
      this.logger.error(`retention: ${label} failed`, e as Error);
      return 0;
    }
  }
}

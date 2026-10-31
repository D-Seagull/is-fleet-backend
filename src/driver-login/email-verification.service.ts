import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { AuthAuditService } from './auth-audit.service';

export const EMAIL_VERIFY_TTL_HOURS = 48;

/**
 * Driver email confirmation. A manager adds / changes a driver's email →
 * `emailVerifiedAt` is cleared and the driver gets a link; only after they
 * open it can sign-in codes go to that address. The link token is stored as
 * a SHA-256 hash, single use, 48 h.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
    private audit: AuthAuditService,
  ) {}

  private hash(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Send (or re-send) the confirmation link for the driver's current email.
   * Earlier links die. `actorId` = the manager who triggered it.
   */
  async send(driverId: string, actorId: string | null, ip?: string | null) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        role: true,
        email: true,
        emailVerifiedAt: true,
        uiLocale: true,
        companyId: true,
      },
    });
    if (!driver || driver.role !== 'DRIVER') {
      throw new NotFoundException('errors.userNotFound');
    }
    if (!driver.email) throw new BadRequestException('errors.noEmailToVerify');
    if (driver.emailVerifiedAt) return { ok: true, alreadyVerified: true };

    const raw = crypto.randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        where: { userId: driver.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: driver.id,
          email: driver.email,
          tokenHash: this.hash(raw),
          expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 3_600_000),
        },
      }),
    ]);

    const base =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const link = `${base}/verify-email?token=${raw}`;
    try {
      await this.mail.sendDriverEmailVerification(
        driver.email,
        link,
        EMAIL_VERIFY_TTL_HOURS,
        driver.uiLocale,
      );
    } catch (err) {
      this.logger.error(
        `Verification email for driver ${driver.id} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await this.audit.record({
      action: 'EMAIL_VERIFICATION_SENT',
      companyId: driver.companyId,
      driverId: driver.id,
      actorId,
      channel: 'EMAIL',
      ip,
    });
    return { ok: true, alreadyVerified: false };
  }

  /** The driver opened the link. Valid only for the address it was sent to. */
  async confirm(raw: string, ip?: string | null) {
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.hash(raw) },
      include: { user: { select: { id: true, email: true, companyId: true } } },
    });
    if (
      !token ||
      token.usedAt ||
      token.expiresAt.getTime() < Date.now() ||
      // The manager changed the address after sending — this link is stale.
      token.user.email?.toLowerCase() !== token.email.toLowerCase()
    ) {
      throw new BadRequestException('errors.emailVerifyInvalid');
    }
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      action: 'EMAIL_VERIFIED',
      companyId: token.user.companyId,
      driverId: token.userId,
      actorId: token.userId,
      channel: 'EMAIL',
      ip,
    });
    this.logger.log(`Driver ${token.userId} confirmed their email`);
    return { ok: true };
  }
}

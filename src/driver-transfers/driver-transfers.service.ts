import * as crypto from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { SmsService } from 'src/sms/sms.service';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { maskPhone } from 'src/common/utils/phone';
import { t } from 'src/i18n/i18n';

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;
// One SMS per driver + company per 10 min, and a daily cap per driver across
// companies — the phone number is all a requester needs to trigger a send.
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 5;

/** What `POST /users/driver` answers while the driver hasn't consented yet. */
export const TRANSFER_PENDING = {
  pending: true,
  code: 'DRIVER_TRANSFER_PENDING',
} as const;

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Moving a driver from one company to another needs the driver's consent.
 * The requesting company only gets a pending request; the driver receives an
 * SMS link to a public page (`/driver-transfer?token=…` on the web app) and
 * accepts or declines there. Possession of the phone is the proof — the same
 * factor the driver logs in with.
 */
@Injectable()
export class DriverTransfersService {
  private readonly logger = new Logger(DriverTransfersService.name);

  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private config: ConfigService,
    private gateway: MessagesGateway,
  ) {}

  /** Open (or reuse) a pending request and text the driver the link. */
  async request(
    driver: {
      id: string;
      phone: string | null;
      language: string | null;
      companyId: string;
    },
    toCompanyId: string,
    requestedById: string,
  ) {
    if (!driver.phone) return TRANSFER_PENDING;
    const now = Date.now();

    // A fresh request for the same pair already went out — don't text again.
    const recent = await this.prisma.driverTransfer.findFirst({
      where: {
        driverId: driver.id,
        toCompanyId,
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: new Date(now) },
        createdAt: { gt: new Date(now - RESEND_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recent) return TRANSFER_PENDING;

    const today = await this.prisma.driverTransfer.count({
      where: {
        driverId: driver.id,
        createdAt: { gt: new Date(now - 24 * 60 * 60 * 1000) },
      },
    });
    if (today >= MAX_REQUESTS_PER_DAY) {
      this.logger.warn(`transfer SMS cap reached for driver ${driver.id}`);
      return TRANSFER_PENDING;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: toCompanyId },
      select: { name: true },
    });

    // Older links for this pair stop working — only the newest SMS counts.
    await this.prisma.driverTransfer.updateMany({
      where: {
        driverId: driver.id,
        toCompanyId,
        acceptedAt: null,
        declinedAt: null,
      },
      data: { expiresAt: new Date(now) },
    });

    const token = crypto.randomBytes(32).toString('base64url');
    const transfer = await this.prisma.driverTransfer.create({
      data: {
        tokenHash: hashToken(token),
        driverId: driver.id,
        fromCompanyId: driver.companyId,
        toCompanyId,
        requestedById,
        expiresAt: new Date(now + TRANSFER_TTL_MS),
      },
    });

    const frontendUrl = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    )
      .split(',')[0]
      .trim();
    const link = `${frontendUrl}/driver-transfer?token=${token}`;
    try {
      await this.sms.send(
        driver.phone,
        t(driver.language, 'sms.driverTransfer', {
          company: company?.name ?? '',
          link,
        }),
      );
    } catch (err) {
      // Undelivered → drop the request so the manager can simply try again.
      this.logger.error(
        `transfer SMS failed for ${maskPhone(driver.phone)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.prisma.driverTransfer
        .delete({ where: { id: transfer.id } })
        .catch(() => {});
    }
    return TRANSFER_PENDING;
  }

  /** A still-usable request for this link token, or 404. */
  private async findOpen(token: unknown) {
    const transfer =
      typeof token === 'string' && token.length >= 20 && token.length <= 128
        ? await this.prisma.driverTransfer.findUnique({
            where: { tokenHash: hashToken(token) },
            include: {
              driver: {
                select: {
                  id: true,
                  firstName: true,
                  role: true,
                  companyId: true,
                  deletedAt: true,
                },
              },
              toCompany: { select: { name: true, isActive: true } },
            },
          })
        : null;
    if (
      !transfer ||
      transfer.acceptedAt ||
      transfer.declinedAt ||
      transfer.expiresAt <= new Date() ||
      transfer.driver.deletedAt ||
      transfer.driver.role !== 'DRIVER' ||
      // Moved somewhere else meanwhile — this request is stale.
      transfer.driver.companyId !== transfer.fromCompanyId ||
      !transfer.toCompany.isActive
    ) {
      throw new NotFoundException('errors.transferInvalid');
    }
    return transfer;
  }

  /** What the consent page shows. Only the link holder (the driver) has it. */
  async lookup(token: unknown) {
    const transfer = await this.findOpen(token);
    const from = await this.prisma.company.findUnique({
      where: { id: transfer.fromCompanyId },
      select: { name: true },
    });
    return {
      driverFirstName: transfer.driver.firstName,
      toCompanyName: transfer.toCompany.name,
      fromCompanyName: from?.name ?? null,
      expiresAt: transfer.expiresAt,
    };
  }

  async accept(token: unknown) {
    const transfer = await this.findOpen(token);
    const driverId = transfer.driverId;

    // The requester becomes the driver's manager — if they're still in the
    // new company (they may have left since).
    const requester = await this.prisma.user.findFirst({
      where: {
        id: transfer.requestedById,
        companyId: transfer.toCompanyId,
        deletedAt: null,
      },
      select: { id: true },
    });

    await this.prisma.$transaction([
      // Trip/message history stays with the old company (it carries its own
      // companyId); the old company's truck is released.
      this.prisma.truck.updateMany({
        where: { currentDriverId: driverId },
        data: { currentDriverId: null },
      }),
      this.prisma.user.update({
        where: { id: driverId },
        data: {
          companyId: transfer.toCompanyId,
          managerId: requester?.id ?? null,
          // The new company hires them — a deactivation by the old one
          // doesn't carry over.
          isActive: true,
        },
      }),
      this.prisma.driverTransfer.update({
        where: { id: transfer.id },
        data: { acceptedAt: new Date() },
      }),
      // Every other open request for this driver is now moot.
      this.prisma.driverTransfer.updateMany({
        where: {
          driverId,
          id: { not: transfer.id },
          acceptedAt: null,
          declinedAt: null,
        },
        data: { expiresAt: new Date() },
      }),
    ]);

    // Live sockets still sit in the old company's rooms — drop them; the
    // driver app reconnects (watchdog) and joins the new company's rooms.
    this.gateway.server.in(driverId).disconnectSockets(true);
    this.logger.log(
      `driver ${driverId} moved ${transfer.fromCompanyId} → ${transfer.toCompanyId}`,
    );
    return { ok: true, toCompanyName: transfer.toCompany.name };
  }

  async decline(token: unknown) {
    const transfer = await this.findOpen(token);
    await this.prisma.driverTransfer.update({
      where: { id: transfer.id },
      data: { declinedAt: new Date() },
    });
    return { ok: true };
  }
}

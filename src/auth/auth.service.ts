import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { maskPhone, normalizePhone } from 'src/common/utils/phone';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { MailService } from 'src/mail/mail.service';
import { SELF_PROFILE_SELECT } from 'src/users/self-profile';
import { OtpChannel } from '@prisma/client';
import { OtpDeliveryService } from 'src/driver-login/otp-delivery.service';
import { AuthAuditService } from 'src/driver-login/auth-audit.service';
import { DriverLoginNoticeService } from 'src/driver-login/driver-login-notice.service';
import {
  CHANNEL_TO_DB,
  DriverOtpChannel,
} from 'src/driver-login/otp-channels';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_MAX_ATTEMPTS = 5;
// A code that goes through the driver's manager (dictated over the phone)
// needs time for a human relay, so it lives longer than an SMS code.
const MANAGER_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
// How many live codes verify checks at once: an SMS code and a manager code
// can both be pending (the driver asks for an SMS on the way to the code
// screen after the manager has already dictated one).
const OTP_MAX_PENDING = 5;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Drivers sign in by code, which may not reach them abroad — so their
// session lives longer. Sliding: every rotation starts a fresh 90 days.
const DRIVER_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
// A token rotated this recently is still accepted once more — see refresh().
const REFRESH_REUSE_GRACE_MS = 60_000;

/** Constant-time string compare; unequal lengths are simply unequal. */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private gateway: MessagesGateway,
    private mail: MailService,
    private config: ConfigService,
    private delivery: OtpDeliveryService,
    private audit: AuthAuditService,
    private notices: DriverLoginNoticeService,
  ) {}

  /**
   * On sign-in, lift an AWAY back to ONLINE — someone logging in is plainly
   * at their device. Only AWAY, because only AWAY is set by the system (web
   * auto-away after 15 min idle). BUSY / SLEEP / VACATION are the person's
   * own choice: a manager may sign in on the desk precisely to work with
   * "do not disturb" on, and timed statuses expire by themselves.
   *
   * Broadcasts `userStatusChanged` to the company room so already-
   * connected sessions (e.g. the driver app holding a cached AWAY for
   * a manager) repaint without waiting for the next refresh.
   */
  private async markSessionStart(userId: string) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (current?.status !== 'AWAY') return;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ONLINE', statusUntil: null },
      select: {
        id: true,
        status: true,
        statusUntil: true,
        lastSeenAt: true,
        companyId: true,
      },
    });
    this.gateway.server
      .to(`company-${updated.companyId}`)
      .emit('userStatusChanged', {
        userId: updated.id,
        status: updated.status,
        statusUntil: updated.statusUntil,
      });
  }
  async adminLogin(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new UnauthorizedException('errors.noAccess');
    }

    const valid = await bcrypt.compare(dto.password, user.password!);
    if (!valid) throw new UnauthorizedException('errors.wrongEmailOrPassword');

    await this.markSessionStart(user.id);
    return this.signToken(
      user.id,
      user.role,
      user.companyId,
      user.firstName,
      user.lastName,
      user.uiLocale,
    );
  }

  async register(dto: RegisterDto) {
    // Спочатку шукаємо по токену юзера (manager/driver)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        inviteToken: dto.inviteToken,
        inviteExpiry: { gt: new Date() }, // токен ще дійсний
      },
    });

    if (existingUser) {
      // Реєструємо manager або driver
      const hash = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          password: hash,
          inviteToken: null, // очищаємо токен
          inviteExpiry: null,
        },
      });

      await this.markSessionStart(user.id);
      return this.signToken(
        user.id,
        user.role,
        user.companyId,
        user.firstName,
        user.lastName,
        user.uiLocale,
      );
    }

    // Якщо не знайшли по юзеру — шукаємо по токену компанії (teamlead)
    const company = await this.prisma.company.findFirst({
      where: {
        inviteToken: dto.inviteToken,
        inviteExpiry: { gt: new Date() },
      },
      include: {
        users: { where: { role: 'TEAMLEAD' } },
      },
    });

    if (!company) throw new BadRequestException('errors.invalidOrExpiredToken');

    const hash = await bcrypt.hash(dto.password, 10);

    // The company link is single-use: claim it in the same transaction as the
    // sign-up, so a second registration on the same link fails and a failed
    // create (e.g. email taken) leaves the link usable.
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.company.updateMany({
        where: { id: company.id, inviteToken: dto.inviteToken },
        data: { inviteToken: null, inviteExpiry: null },
      });
      if (claimed.count === 0)
        throw new BadRequestException('errors.invalidOrExpiredToken');

      return tx.user.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          email: dto.email,
          password: hash,
          role: 'TEAMLEAD',
          companyId: company.id,
        },
      });
    });

    // якщо перший тімлід — оновлюємо дані компанії
    if (company.users.length === 0) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: {
          accountingEmail: dto.accountingEmail,
          hrEmail: dto.hrEmail,
          directorEmail: dto.directorEmail,
        },
      });
    }

    await this.markSessionStart(user.id);
    return this.signToken(
      user.id,
      user.role,
      user.companyId,
      user.firstName,
      user.lastName,
      user.uiLocale,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('errors.loginOrPasswordWrong');

    const valid = await bcrypt.compare(dto.password, user.password!);
    if (!valid) throw new UnauthorizedException('errors.loginOrPasswordWrong');
    await this.markSessionStart(user.id);
    return this.signToken(
      user.id,
      user.role,
      user.companyId,
      user.firstName,
      user.lastName,
      user.uiLocale,
    );
  }
  // Issues a short-ish access JWT (TTL from JwtModule — kept at 7d during the
  // access+refresh rollout, to be flipped to 15m once every client refreshes)
  // plus a refresh token (30 days, drivers 90) persisted (hashed) in the DB. Shape stays
  // backward-compatible: `access_token` + `user` as before, plus `refresh_token`.
  private async signToken(
    userId: string,
    role: string,
    companyId: string,
    firstName: string,
    lastName: string | null,
    uiLocale: 'UK' | 'EN' | 'PL' | 'LT' | 'DE' | 'RU',
  ) {
    const payload = { sub: userId, role, companyId };
    const refresh_token = await this.issueRefreshToken(userId, role);
    // The full own profile, same as /auth/me — clients keep this as their
    // user, and a bare id/role/name here wiped the mobile avatar on every
    // token refresh. The bare shape is only a fallback if the row is gone.
    const user = (await this.getMe(userId)) ?? {
      id: userId,
      role,
      companyId,
      firstName,
      lastName,
      uiLocale,
    };
    return {
      access_token: this.jwt.sign(payload),
      refresh_token,
      user,
    };
  }

  // ─── Refresh tokens (access + refresh flow) ─────────────────────────────────
  // We persist only a SHA-256 hash of the opaque token — a DB leak can't be
  // replayed, and each token is single-use (rotated on every refresh).
  private hashToken(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  // A 6-digit code has only a million values, so a plain SHA-256 of it is
  // reversed instantly — the hash is keyed with JWT_SECRET (never in the DB)
  // and bound to the phone, so a leaked otp_codes table gives nothing away.
  private hashOtp(phone: string, code: string) {
    return crypto
      .createHmac('sha256', this.config.get<string>('JWT_SECRET') ?? '')
      .update(`${phone}:${code}`)
      .digest('hex');
  }

  /** Refresh TTL by role — see DRIVER_REFRESH_TTL_MS. */
  static refreshTtlMs(role: string) {
    return role === 'DRIVER' ? DRIVER_REFRESH_TTL_MS : REFRESH_TTL_MS;
  }

  private async issueRefreshToken(
    userId: string,
    role: string,
  ): Promise<string> {
    const raw = crypto.randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(raw),
        userId,
        expiresAt: new Date(Date.now() + AuthService.refreshTtlMs(role)),
      },
    });
    return raw;
  }

  /**
   * Rotate a refresh token: validate it, revoke the old row, and mint a fresh
   * access+refresh pair. A revoked / expired / unknown token is rejected — that
   * is what makes a stolen or logged-out session stop working (unlike a bare
   * long-lived JWT, which can't be revoked).
   *
   * Grace: a token rotated less than REFRESH_REUSE_GRACE_MS ago gets a fresh
   * pair too instead of a 401. That is a race, not theft — two browser tabs
   * sharing the refresh cookie both refreshing on the same expired access
   * token, or a response lost on a flaky mobile link and retried. A strict
   * 401 there logged the user out (and the losing tab's logout then revoked
   * the winner's new token too). Logout makes a token unusable at once by
   * also expiring it (revokeRefresh), so it never falls in the grace window.
   */
  async refresh(rawRefresh: string | undefined) {
    if (!rawRefresh) throw new UnauthorizedException('errors.noAccess');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawRefresh) },
      include: { user: true },
    });
    const now = Date.now();
    if (!record || record.expiresAt.getTime() < now) {
      throw new UnauthorizedException('errors.noAccess');
    }
    if (record.revokedAt) {
      if (now - record.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        throw new UnauthorizedException('errors.noAccess');
      }
    } else {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date(now) },
      });
    }
    const u = record.user;
    // Deactivated / deleted accounts get their tokens revoked, but refuse
    // here too so no leftover token outlives the account.
    if (!u.isActive || u.deletedAt) {
      throw new UnauthorizedException('errors.noAccess');
    }
    return this.signToken(
      u.id,
      u.role,
      u.companyId,
      u.firstName,
      u.lastName,
      u.uiLocale,
    );
  }

  /** Logout — revoke the presented refresh token (no-op if absent/unknown). */
  async revokeRefresh(rawRefresh: string | undefined) {
    if (rawRefresh) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(rawRefresh) },
        // Expired as well as revoked: a logged-out token must not be honoured
        // by refresh()'s rotation grace window.
        data: { revokedAt: new Date(), expiresAt: new Date() },
      });
    }
    return { ok: true };
  }
  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: SELF_PROFILE_SELECT,
    });
  }
  async checkInvite(token: string) {
    // Перевіряємо токен юзера
    const user = await this.prisma.user.findFirst({
      where: {
        inviteToken: token,
        inviteExpiry: { gt: new Date() },
      },
      include: { company: true },
    });

    if (user) {
      return {
        type: 'user',
        role: user.role,
        companyName: user.company.name,
        isFirstUser: false,
      };
    }

    // Перевіряємо токен компанії
    const company = await this.prisma.company.findFirst({
      where: { inviteToken: token, inviteExpiry: { gt: new Date() } },
      include: {
        users: { where: { role: 'TEAMLEAD' } },
      },
    });

    if (!company) throw new BadRequestException('errors.invalidToken');

    return {
      type: 'company',
      role: 'TEAMLEAD',
      companyName: company.name,
      isFirstUser: company.users.length === 0,
    };
  }

  // ─── Driver OTP login ───────────────────────────────────────────────────────
  // One code per request, delivered through ONE method (sms / whatsapp /
  // telegram / email to the manager), each behind its own on/off flag. Same
  // rules for all: crypto.randomInt 6 digits, keyed hash at rest, TTL,
  // 5 attempts, single use, per-phone cooldown + throttling, and never a hint
  // whether the phone is registered.

  /** The driver row (if any) behind a phone, with what the channels need. */
  private findDriverForOtp(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        role: true,
        isActive: true,
        companyId: true,
        phone: true,
        uiLocale: true,
        firstName: true,
        lastName: true,
        currentTruck: {
          select: {
            manager: {
              select: {
                id: true,
                email: true,
                isActive: true,
                companyId: true,
                uiLocale: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Which sign-in methods are switched on. The same for every phone — it
   * says nothing about whether a number is registered.
   */
  driverOtpChannels() {
    return { channels: this.delivery.enabledMethods() };
  }

  /**
   * Step 1 of driver login. Always `{ ok: true }` — whether or not the phone
   * is registered, and whether or not the asked channel can reach this
   * driver (an unknown / unavailable channel simply sends nothing).
   */
  async requestDriverOtp(
    phoneInput: string,
    channel: string = 'sms',
    ip?: string | null,
  ) {
    const phone = normalizePhone(phoneInput);
    this.logger.log(
      `requestDriverOtp[${channel}]: ${phone ? maskPhone(phone) : 'INVALID'}`,
    );

    if (!phone) {
      // Bad shape — silently bail to avoid leaking which formats are valid.
      return { ok: true };
    }

    const driver = await this.findDriverForOtp(phone);
    if (!driver || driver.role !== 'DRIVER' || !driver.isActive) {
      this.logger.warn(
        `OTP request for ${maskPhone(phone)}: no active DRIVER row found — returning ok:true silently`,
      );
      return { ok: true };
    }

    // Store reviewers (Google Play / App Store) can't receive our SMS, so the
    // demo driver's code is fixed and nothing is sent — whatever the method
    // flags say, or the reviewer couldn't sign in at all. verifyDriverOtp is
    // untouched — same TTL, attempt limit and single use as a real code.
    const reviewCode = this.reviewOtpFor(phone);
    if (reviewCode) {
      await this.assertOtpCooldown(phone, 'SMS');
      await this.storeOtp(driver.id, phone, reviewCode, 'sms', OTP_TTL_MS);
      this.logger.log(`OTP for review phone: fixed code, nothing sent`);
      return { ok: true };
    }

    if (channel === 'manager') {
      if (!this.delivery.isEnabled('manager')) {
        this.logger.warn(`OTP request: method "manager" is off — nothing sent`);
        return { ok: true };
      }
      return this.requestViaManager(driver, phone, ip);
    }

    const target = this.delivery.direct(channel);
    if (!target) {
      this.logger.warn(
        `OTP request for driver ${driver.id}: method "${channel}" unknown or off — nothing sent`,
      );
      return { ok: true };
    }

    // Cooldown — one code per phone per method per minute (the driver may
    // switch from SMS to another method right away when the SMS doesn't come).
    await this.assertOtpCooldown(phone, CHANNEL_TO_DB[target.name]);

    const code = this.newOtpCode();
    await this.storeOtp(driver.id, phone, code, target.name, OTP_TTL_MS);
    await this.audit.record({
      action: 'CODE_ISSUED',
      companyId: driver.companyId,
      driverId: driver.id,
      actorId: driver.id,
      channel: CHANNEL_TO_DB[target.name],
      ip,
    });

    // A delivery failure (e.g. a Twilio trial account can only reach verified
    // numbers → error 21608) must NOT 500 the request — the OTP row already
    // exists. Log the real reason for ops; the client still sees a neutral ok.
    // Without Twilio creds (dev/test) SmsService logs the body instead.
    try {
      await target.deliver(
        { id: driver.id, phone, uiLocale: driver.uiLocale },
        code,
        OTP_TTL_MS / 60_000,
      );
    } catch (err) {
      this.logger.error(
        `OTP delivery [${target.name}] failed for ${maskPhone(phone)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { ok: true };
  }

  private newOtpCode() {
    return String(crypto.randomInt(100000, 1000000));
  }

  // Only a keyed hash is stored — see hashOtp.
  private storeOtp(
    userId: string,
    phone: string,
    code: string,
    channel: DriverOtpChannel,
    ttlMs: number,
    issuedById: string | null = null,
  ) {
    return this.prisma.otpCode.create({
      data: {
        phone,
        code: this.hashOtp(phone, code),
        userId,
        expiresAt: new Date(Date.now() + ttlMs),
        channel: CHANNEL_TO_DB[channel],
        issuedById,
      },
    });
  }

  /**
   * The fixed OTP for the store-review demo driver, or null. Off unless both
   * REVIEW_PHONE and a 6-digit REVIEW_OTP are set — a typo in either keeps
   * the normal SMS flow rather than opening a weak backdoor.
   */
  private reviewOtpFor(phone: string): string | null {
    const reviewPhone = normalizePhone(
      this.config.get<string>('REVIEW_PHONE') ?? '',
    );
    const reviewOtp = this.config.get<string>('REVIEW_OTP') ?? '';
    if (!reviewPhone || !/^\d{6}$/.test(reviewOtp)) return null;
    return phone === reviewPhone ? reviewOtp : null;
  }

  /** One code per phone per channel per minute. */
  private async assertOtpCooldown(phone: string, channel: OtpChannel) {
    const lastSent = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        channel,
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (lastSent) {
      throw new HttpException(
        'errors.pleaseWaitCode',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ─── Driver login through the manager ───────────────────────────────────────
  // Last resort when no channel reaches the driver. Only the driver's actual
  // manager — the manager of their current truck (Truck.managerId), same
  // company — ever sees the code. User.managerId is NOT used: it is just
  // whoever created the driver and never follows truck reassignments. The
  // driver is told (push + SMS) whenever such a code is issued and used, and
  // every step lands in AuthAuditLog.

  /**
   * Driver side: "ask my manager" — the code is emailed to the truck's
   * manager, who passes it on. Always `{ ok: true }` (see requestDriverOtp).
   */
  private async requestViaManager(
    driver: NonNullable<Awaited<ReturnType<AuthService['findDriverForOtp']>>>,
    phone: string,
    ip?: string | null,
  ) {
    const manager = driver.currentTruck?.manager;
    if (
      !manager ||
      !manager.isActive ||
      !manager.email ||
      manager.companyId !== driver.companyId
    ) {
      this.logger.warn(
        `Manager-code request for driver ${driver.id}: no reachable truck manager — nothing sent`,
      );
      return { ok: true };
    }

    await this.assertOtpCooldown(phone, 'MANAGER');

    const code = this.newOtpCode();
    await this.storeOtp(
      driver.id,
      phone,
      code,
      'manager',
      MANAGER_CODE_TTL_MS,
      manager.id,
    );
    await this.audit.record({
      action: 'CODE_ISSUED',
      companyId: driver.companyId,
      driverId: driver.id,
      actorId: driver.id,
      channel: 'MANAGER',
      ip,
    });

    try {
      await this.mail.sendDriverLoginCode(manager.email, {
        driverName: `${driver.firstName} ${driver.lastName ?? ''}`.trim(),
        driverPhone: maskPhone(phone),
        code,
        ttlMinutes: MANAGER_CODE_TTL_MS / 60_000,
        locale: manager.uiLocale,
      });
      this.logger.log(
        `Login code for driver ${driver.id} (${maskPhone(phone)}) emailed to manager ${manager.id}`,
      );
    } catch (err) {
      this.logger.error(
        `Login-code email to manager ${manager.id} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await this.notices.managerCode('issued', driver.id, manager.id);
    return { ok: true };
  }

  /** Whether managers may mint codes on the driver page (dev only by default). */
  managerLoginCodeEnabled() {
    return this.config.get<string>('MANAGER_LOGIN_CODE_ENABLED') === 'true';
  }

  /**
   * Manager side: the truck's manager mints a code on the driver's page and
   * dictates it. Off unless MANAGER_LOGIN_CODE_ENABLED=true — the route
   * refuses, not just the button. Returned once in plain text; only the hash
   * is stored.
   */
  async issueDriverLoginCode(
    requesterId: string,
    driverId: string,
    ip?: string | null,
  ) {
    if (!this.managerLoginCodeEnabled()) {
      throw new ForbiddenException('errors.featureDisabled');
    }
    const [requester, driver] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { id: true, companyId: true, isActive: true },
      }),
      this.prisma.user.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          role: true,
          phone: true,
          isActive: true,
          companyId: true,
          deletedAt: true,
          currentTruck: { select: { managerId: true } },
        },
      }),
    ]);

    // Tenant + ownership: only the manager of the driver's current truck,
    // same company. A driver without a truck has no manager to vouch for them.
    if (
      !requester?.isActive ||
      !driver ||
      driver.role !== 'DRIVER' ||
      driver.currentTruck?.managerId !== requester.id ||
      driver.companyId !== requester.companyId
    ) {
      this.logger.warn(
        `Login code refused: user ${requesterId} is not the truck manager of driver ${driverId}`,
      );
      throw new ForbiddenException('errors.notAssignedManager');
    }
    const phone = driver.phone ? normalizePhone(driver.phone) : null;
    if (!driver.isActive || driver.deletedAt || !phone) {
      throw new BadRequestException('errors.driverNotActive');
    }

    const code = this.newOtpCode();
    const row = await this.storeOtp(
      driver.id,
      phone,
      code,
      'manager',
      MANAGER_CODE_TTL_MS,
      requester.id,
    );
    await this.audit.record({
      action: 'CODE_ISSUED',
      companyId: driver.companyId,
      driverId: driver.id,
      actorId: requester.id,
      channel: 'MANAGER',
      ip,
    });
    this.logger.log(
      `Login code issued by manager ${requester.id} for driver ${driver.id} (${maskPhone(phone)})`,
    );
    await this.notices.managerCode('issued', driver.id, requester.id);
    return { code, expiresAt: row.expiresAt };
  }

  /**
   * Step 2 of driver login. Checks the code against the phone's live codes
   * (newest first — codes from several channels may be pending at once). On
   * success every pending code is burnt and we issue a JWT — companyId is
   * read straight from the User row, so the driver never has to pick a company.
   */
  async verifyDriverOtp(phoneInput: string, code: string, ip?: string | null) {
    const phone = normalizePhone(phoneInput);
    // Never log the entered code — it's a live credential for 5 minutes.
    this.logger.log(`verifyDriverOtp: ${phone ? maskPhone(phone) : 'INVALID'}`);

    if (!phone) {
      throw new UnauthorizedException('errors.codeInvalidOrExpired');
    }

    const pending = await this.prisma.otpCode.findMany({
      where: {
        phone,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: OTP_MAX_PENDING,
      include: { user: true },
    });

    if (pending.length === 0) {
      throw new UnauthorizedException('errors.codeInvalidOrExpired');
    }

    // Lock exhausted codes — the driver must get a fresh one.
    const exhausted = pending.filter((o) => o.attempts >= OTP_MAX_ATTEMPTS);
    if (exhausted.length > 0) {
      await this.prisma.otpCode.updateMany({
        where: { id: { in: exhausted.map((o) => o.id) } },
        data: { usedAt: new Date() },
      });
    }
    const live = pending.filter((o) => o.attempts < OTP_MAX_ATTEMPTS);
    if (live.length === 0) {
      throw new UnauthorizedException('errors.tooManyAttempts');
    }

    const hash = this.hashOtp(phone, code);
    const otp = live.find((o) => safeEqual(o.code, hash));
    if (!otp) {
      // A miss counts against every live code, so several pending codes
      // don't multiply the guesses an attacker gets.
      await this.prisma.otpCode.updateMany({
        where: { id: { in: live.map((o) => o.id) } },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('errors.codeInvalidOrExpired');
    }

    if (otp.user.role !== 'DRIVER' || !otp.user.isActive) {
      throw new ForbiddenException('errors.driverNotActive');
    }

    // Mark as used + invalidate any other pending OTPs for this phone.
    await this.prisma.otpCode.updateMany({
      where: { phone, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.audit.record({
      action: 'CODE_USED',
      companyId: otp.user.companyId,
      driverId: otp.user.id,
      actorId: otp.user.id,
      channel: otp.channel,
      ip,
    });
    if (otp.channel === 'MANAGER') {
      await this.notices.managerCode('used', otp.user.id, otp.issuedById);
    }

    await this.markSessionStart(otp.user.id);
    return this.signToken(
      otp.user.id,
      otp.user.role,
      otp.user.companyId,
      otp.user.firstName,
      otp.user.lastName,
      otp.user.uiLocale,
    );
  }

  // ─── Password reset (email users only — managers/admins/teamleads) ──────────

  /**
   * Always responds with `{ ok: true }` — the API surface must not tell an
   * attacker whether a given email is registered. If a matching user with a
   * password on file exists, we invalidate any outstanding tokens, mint a new
   * one, and email the reset link. Delivery is fire-and-forget so a slow Gmail
   * SMTP handshake (common on Render free tier) never blocks the response.
   */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) return { ok: true };

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    // The raw token only travels in the email link; the row holds its hash,
    // same as refresh tokens.
    await this.prisma.passwordResetToken.create({
      data: { token: this.hashToken(token), userId: user.id, expiresAt },
    });

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    this.mail
      .sendPasswordReset(email, resetLink)
      .catch((err) =>
        this.logger.error(
          `sendPasswordReset failed for ${email}: ${err.message}`,
        ),
      );

    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: this.hashToken(token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('errors.linkInvalidOrExpired');
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }
}

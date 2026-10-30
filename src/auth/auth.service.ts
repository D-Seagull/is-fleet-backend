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
import { SmsService } from 'src/sms/sms.service';
import { maskPhone, normalizePhone } from 'src/common/utils/phone';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { MailService } from 'src/mail/mail.service';
import { SELF_PROFILE_SELECT } from 'src/users/self-profile';

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
    private sms: SmsService,
    private gateway: MessagesGateway,
    private mail: MailService,
    private config: ConfigService,
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
  // plus a 30-day refresh token persisted (hashed) in the DB. Shape stays
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
    const refresh_token = await this.issueRefreshToken(userId);
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

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(raw),
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
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

  /**
   * Step 1 of driver login. We never reveal whether the phone is registered:
   * the response is always 200 OK to prevent phone-number enumeration.
   * If the phone matches an active DRIVER, an SMS is sent with a 6-digit code.
   */
  async requestDriverOtp(phoneInput: string) {
    const phone = normalizePhone(phoneInput);
    this.logger.log(
      `requestDriverOtp: ${phone ? maskPhone(phone) : 'INVALID'}`,
    );

    if (!phone) {
      // Bad shape — silently bail to avoid leaking which formats are valid.
      return { ok: true };
    }

    const user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user || user.role !== 'DRIVER' || !user.isActive) {
      this.logger.warn(
        `OTP request for ${maskPhone(phone)}: no active DRIVER row found — returning ok:true silently`,
      );
      return { ok: true };
    }

    // Cooldown — one SMS per phone per minute.
    await this.assertOtpCooldown(phone);

    const reviewCode = this.reviewOtpFor(phone);
    const code = reviewCode ?? String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Only a keyed hash is stored — see hashOtp.
    await this.prisma.otpCode.create({
      data: {
        phone,
        code: this.hashOtp(phone, code),
        userId: user.id,
        expiresAt,
      },
    });

    // Store reviewers (Google Play / App Store) can't receive our SMS, so the
    // demo driver's code is fixed and nothing is sent. verifyDriverOtp is
    // untouched — same TTL, attempt limit and single use as a real code.
    if (reviewCode) {
      this.logger.log(`OTP for review phone: fixed code, no SMS`);
      return { ok: true };
    }

    // Delivery: with Twilio creds set, this sends a real SMS; without them
    // (dev/test) SmsService falls back to logging the body, so the OTP flow
    // is still testable locally without leaking codes in production logs.
    // A delivery failure (e.g. a Twilio trial account can only reach verified
    // numbers → error 21608) must NOT 500 the request — the OTP row already
    // exists. Log the real reason for ops; the client still sees a neutral ok.
    try {
      await this.sms.send(phone, `Your IS Fleet code: ${code}`);
    } catch (err) {
      this.logger.error(
        `SMS delivery failed for ${maskPhone(phone)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return { ok: true };
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

  /** One code per phone per minute, whichever way it is delivered. */
  private async assertOtpCooldown(phone: string) {
    const lastSent = await this.prisma.otpCode.findFirst({
      where: {
        phone,
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

  // ─── Driver login without SMS (via the assigned manager) ────────────────────
  // SMS doesn't reach some drivers (UA numbers roaming in DE/AT). Both ways
  // below mint an ordinary OtpCode row — hashed, single use, attempt-limited —
  // that the driver types on the usual code screen. Only the driver's OWN
  // assigned manager (User.managerId) ever sees the code.

  /**
   * Driver side: "SMS didn't come — send the code to my manager". Emails the
   * code to the assigned manager, who passes it on. Same anti-enumeration
   * contract as requestDriverOtp: always `{ ok: true }`.
   */
  async requestDriverOtpViaManager(phoneInput: string) {
    const phone = normalizePhone(phoneInput);
    this.logger.log(
      `requestDriverOtpViaManager: ${phone ? maskPhone(phone) : 'INVALID'}`,
    );
    if (!phone) return { ok: true };

    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
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
    });
    if (!user || user.role !== 'DRIVER' || !user.isActive) {
      this.logger.warn(
        `Manager-code request for ${maskPhone(phone)}: no active DRIVER row found — returning ok:true silently`,
      );
      return { ok: true };
    }

    const manager = user.manager;
    if (
      !manager ||
      !manager.isActive ||
      !manager.email ||
      manager.companyId !== user.companyId
    ) {
      this.logger.warn(
        `Manager-code request for driver ${user.id}: no reachable assigned manager — nothing sent`,
      );
      return { ok: true };
    }

    await this.assertOtpCooldown(phone);

    const code = String(crypto.randomInt(100000, 1000000));
    await this.prisma.otpCode.create({
      data: {
        phone,
        code: this.hashOtp(phone, code),
        userId: user.id,
        expiresAt: new Date(Date.now() + MANAGER_CODE_TTL_MS),
      },
    });

    try {
      await this.mail.sendDriverLoginCode(manager.email, {
        driverName: `${user.firstName} ${user.lastName}`.trim(),
        driverPhone: maskPhone(phone),
        code,
        ttlMinutes: MANAGER_CODE_TTL_MS / 60_000,
        locale: manager.uiLocale,
      });
      this.logger.log(
        `Login code for driver ${user.id} (${maskPhone(phone)}) emailed to manager ${manager.id}`,
      );
    } catch (err) {
      this.logger.error(
        `Login-code email to manager ${manager.id} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { ok: true };
  }

  /**
   * Manager side: the assigned manager mints a code on the driver's page and
   * dictates it. Returned once in plain text; only the hash is stored.
   */
  async issueDriverLoginCode(requesterId: string, driverId: string) {
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
          managerId: true,
          deletedAt: true,
        },
      }),
    ]);

    // Tenant + ownership: only the driver's own assigned manager, same company.
    if (
      !requester?.isActive ||
      !driver ||
      driver.role !== 'DRIVER' ||
      driver.managerId !== requester.id ||
      driver.companyId !== requester.companyId
    ) {
      this.logger.warn(
        `Login code refused: user ${requesterId} is not the assigned manager of ${driverId}`,
      );
      throw new ForbiddenException('errors.notAssignedManager');
    }
    const phone = driver.phone ? normalizePhone(driver.phone) : null;
    if (!driver.isActive || driver.deletedAt || !phone) {
      throw new BadRequestException('errors.driverNotActive');
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + MANAGER_CODE_TTL_MS);
    await this.prisma.otpCode.create({
      data: {
        phone,
        code: this.hashOtp(phone, code),
        userId: driver.id,
        expiresAt,
      },
    });
    this.logger.log(
      `Login code issued by manager ${requester.id} for driver ${driver.id} (${maskPhone(phone)})`,
    );
    return { code, expiresAt };
  }

  /**
   * Step 2 of driver login. Checks the code against the phone's live codes
   * (newest first — an SMS code and a manager code may both be pending). On
   * success every pending code is burnt and we issue a JWT — companyId is
   * read straight from the User row, so the driver never has to pick a company.
   */
  async verifyDriverOtp(phoneInput: string, code: string) {
    const phone = normalizePhone(phoneInput);
    // Never log the entered code — it's a live credential for 5 minutes.
    this.logger.log(
      `verifyDriverOtp: ${phone ? maskPhone(phone) : 'INVALID'}`,
    );

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

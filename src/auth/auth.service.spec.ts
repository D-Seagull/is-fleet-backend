import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SmsService } from 'src/sms/sms.service';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { MailService } from 'src/mail/mail.service';
import { OtpDeliveryService } from 'src/driver-login/otp-delivery.service';
import { AuthAuditService } from 'src/driver-login/auth-audit.service';
import { DriverLoginNoticeService } from 'src/driver-login/driver-login-notice.service';

jest.mock('bcrypt');
import * as bcrypt from 'bcrypt';
import { createHash, createHmac } from 'crypto';
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// expo-server-sdk is ESM-only and gets pulled in transitively via the
// MessagesGateway → messages.service → push.service import chain. The gateway
// is a useValue mock here, so this stub just keeps the module graph parseable.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

const VALID_PHONE = '+380971234567';
// What AuthService stores for an OTP (config mock has no JWT_SECRET → '' key).
const otpHash = (code: string, phone = VALID_PHONE) =>
  createHmac('sha256', '').update(`${phone}:${code}`).digest('hex');
const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

// A minimal User row shaped for the fields signToken / markSessionStart read.
const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  role: 'DRIVER',
  companyId: 'c1',
  firstName: 'Ann',
  lastName: 'Driver',
  uiLocale: 'UK',
  isActive: true,
  deletedAt: null,
  password: 'hashed',
  status: 'ONLINE',
  statusUntil: null,
  phone: VALID_PHONE,
  currentTruck: null,
  ...over,
});
const DAY = 24 * 60 * 60 * 1000;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: Record<string, jest.Mock>;
    company: Record<string, jest.Mock>;
    refreshToken: Record<string, jest.Mock>;
    otpCode: Record<string, jest.Mock>;
    passwordResetToken: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let jwt: { sign: jest.Mock };
  let sms: { send: jest.Mock };
  let config: { get: jest.Mock };
  let mail: {
    sendPasswordReset: jest.Mock;
    sendDriverLoginCode: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let notices: { managerCode: jest.Mock };
  const setEnv = (vars: Record<string, string>) =>
    config.get.mockImplementation((k: string) => vars[k]);
  let emit: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: 'u1',
          status: 'ONLINE',
          statusUntil: null,
          companyId: 'c1',
        }),
        create: jest.fn(),
      },
      company: { findFirst: jest.fn(), update: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'r1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      otpCode: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'o1' }),
        update: jest.fn().mockResolvedValue({ id: 'o1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    jwt = { sign: jest.fn().mockReturnValue('access.jwt') };
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn() };
    mail = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendDriverLoginCode: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notices = { managerCode: jest.fn().mockResolvedValue(undefined) };
    emit = jest.fn();
    const gateway = { server: { to: jest.fn().mockReturnValue({ emit }) } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: SmsService, useValue: sms },
        { provide: MessagesGateway, useValue: gateway },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: config },
        // The real channel registry — channel selection is under test here.
        OtpDeliveryService,
        { provide: AuthAuditService, useValue: audit },
        { provide: DriverLoginNoticeService, useValue: notices },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // ─── login ────────────────────────────────────────────────────────────────
  describe('login', () => {
    const dto = { email: 'a@b.co', password: 'pw' };

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: 'MANAGER' }));
      mockedBcrypt.compare.mockResolvedValue(false as never);
      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('issues an access+refresh pair on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: 'MANAGER' }));
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const res = await service.login(dto);

      expect(res.access_token).toBe('access.jwt');
      expect(typeof res.refresh_token).toBe('string');
      expect(res.user.id).toBe('u1');
      // Already ONLINE → markSessionStart leaves the status alone.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      // A refresh row was persisted.
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('lifts a system-set AWAY back to ONLINE and broadcasts it', async () => {
      prisma.user.findUnique.mockResolvedValue(
        userRow({ role: 'MANAGER', status: 'AWAY' }),
      );
      mockedBcrypt.compare.mockResolvedValue(true as never);

      await service.login(dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ONLINE', statusUntil: null },
        }),
      );
      expect(emit).toHaveBeenCalledWith(
        'userStatusChanged',
        expect.objectContaining({ userId: 'u1', status: 'ONLINE' }),
      );
    });

    it.each(['BUSY', 'SLEEP', 'VACATION'])(
      'keeps a status the person chose (%s)',
      async (status) => {
        prisma.user.findUnique.mockResolvedValue(
          userRow({ role: 'MANAGER', status }),
        );
        mockedBcrypt.compare.mockResolvedValue(true as never);

        await service.login(dto);

        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
      },
    );
  });

  // ─── refresh (rotation) ─────────────────────────────────────────────────────
  describe('refresh', () => {
    it('rejects a missing token', async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token rotated more than a minute ago (reuse)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: new Date(Date.now() - 61_000),
        expiresAt: new Date(Date.now() + 1000),
        user: userRow(),
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('accepts a token rotated seconds ago (second tab / retried request)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: new Date(Date.now() - 5_000),
        expiresAt: new Date(Date.now() + 1000),
        user: userRow({ role: 'MANAGER' }),
      });

      const res = await service.refresh('raw');

      expect(res.access_token).toBe('access.jwt');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      // Already revoked — not touched again.
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('returns the full own profile — clients keep it, a bare user wiped the avatar', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: userRow(),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: 'DRIVER',
        avatar: 'https://cdn/avatar.jpg',
        currentTruck: { id: 't1', plate: 'BE 9130', status: 'ON_TRIP' },
      });

      const res = await service.refresh('raw');

      expect(res.user).toEqual(
        expect.objectContaining({
          avatar: 'https://cdn/avatar.jpg',
          currentTruck: expect.objectContaining({ plate: 'BE 9130' }),
        }),
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });

    it('rejects a logged-out token even within the grace window', async () => {
      // revokeRefresh expires the row as it revokes it.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: new Date(Date.now() - 1_000),
        expiresAt: new Date(Date.now() - 1_000),
        user: userRow(),
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: userRow(),
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it.each([
      ['DRIVER', 90],
      ['MANAGER', 30],
      ['TEAMLEAD', 30],
    ])(
      'a %s session slides: every rotation starts %i fresh days',
      async (role, days) => {
        prisma.refreshToken.findUnique.mockResolvedValue({
          id: 'r1',
          revokedAt: null,
          // Almost expired — rotation must not carry the old deadline over.
          expiresAt: new Date(Date.now() + 1000),
          user: userRow({ role }),
        });
        await service.refresh('raw');
        const ttl =
          prisma.refreshToken.create.mock.calls[0][0].data.expiresAt.getTime() -
          Date.now();
        expect(ttl).toBeGreaterThan(days * DAY - 60_000);
        expect(ttl).toBeLessThanOrEqual(days * DAY);
      },
    );

    it.each([
      ['deactivated', { isActive: false }],
      ['deleted', { deletedAt: new Date() }],
    ])('refuses a %s account', async (_, over) => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: userRow(over),
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rotates a valid token: revokes the old row and mints a new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
        user: userRow({ role: 'MANAGER' }),
      });

      const res = await service.refresh('raw');

      // Old row revoked (single-use).
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      // Fresh pair issued.
      expect(res.access_token).toBe('access.jwt');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  // ─── revokeRefresh (logout) ─────────────────────────────────────────────────
  describe('revokeRefresh', () => {
    it('is a no-op when no token is presented', async () => {
      await expect(service.revokeRefresh(undefined)).resolves.toEqual({
        ok: true,
      });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes the presented token', async () => {
      await expect(service.revokeRefresh('raw')).resolves.toEqual({ ok: true });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── verifyDriverOtp ────────────────────────────────────────────────────────
  describe('verifyDriverOtp', () => {
    const otpRow = (over: Record<string, unknown> = {}) => ({
      id: 'o1',
      code: otpHash('123456'),
      attempts: 0,
      channel: 'SMS',
      issuedById: null,
      user: userRow(),
      ...over,
    });

    it('never logs the entered code or the full phone number', async () => {
      const logged: string[] = [];
      const capture = (m: unknown) => void logged.push(String(m));
      const spies = (['log', 'warn', 'error', 'debug'] as const).map((lvl) =>
        jest.spyOn(Logger.prototype, lvl).mockImplementation(capture),
      );
      prisma.otpCode.findMany.mockResolvedValue([]);
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await service.verifyDriverOtp(VALID_PHONE, '918273').catch(() => {});
      await service.requestDriverOtp(VALID_PHONE).catch(() => {});
      spies.forEach((s) => s.mockRestore());

      expect(logged.length).toBeGreaterThan(0);
      for (const line of logged) {
        expect(line).not.toContain('918273');
        expect(line).not.toContain('971234567');
      }
    });

    it('rejects an unparseable phone', async () => {
      await expect(
        service.verifyDriverOtp('not-a-phone', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otpCode.findMany).not.toHaveBeenCalled();
    });

    it('rejects when there is no pending OTP', async () => {
      prisma.otpCode.findMany.mockResolvedValue([]);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('locks the OTP after too many attempts', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ code: otpHash('000000'), attempts: 5 }),
      ]);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toThrow(/tooManyAttempts/);
      // Burns the OTP so a fresh one is required.
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['o1'] } },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('an exhausted code stays locked even for the right code', async () => {
      prisma.otpCode.findMany.mockResolvedValue([otpRow({ attempts: 5 })]);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toThrow(/tooManyAttempts/);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('increments attempts on a wrong code', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ code: otpHash('654321'), attempts: 1 }),
      ]);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['o1'] } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('a miss counts against every live code at once', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ id: 'sms', code: otpHash('111111') }),
        otpRow({ id: 'mgr', code: otpHash('222222') }),
      ]);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '333333'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['sms', 'mgr'] } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('accepts an older manager code while a newer SMS code is pending', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ id: 'sms', code: otpHash('111111') }),
        otpRow({ id: 'mgr', code: otpHash('222222') }),
      ]);
      const res = await service.verifyDriverOtp(VALID_PHONE, '222222');
      expect(res.access_token).toBe('access.jwt');
      expect(prisma.otpCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ phone: VALID_PHONE, usedAt: null }),
          take: 5,
        }),
      );
    });

    it('forbids a non-driver / inactive account even with the right code', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ user: userRow({ role: 'MANAGER' }) }),
      ]);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('audits the sign-in with the code channel', async () => {
      prisma.otpCode.findMany.mockResolvedValue([otpRow({ channel: 'EMAIL' })]);
      await service.verifyDriverOtp(VALID_PHONE, '123456', '9.9.9.9');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CODE_USED',
          channel: 'EMAIL',
          driverId: 'u1',
          ip: '9.9.9.9',
        }),
      );
      expect(notices.managerCode).not.toHaveBeenCalled();
    });

    it('tells the driver when a manager code was used', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ channel: 'MANAGER', issuedById: 'm1' }),
      ]);
      await service.verifyDriverOtp(VALID_PHONE, '123456');
      expect(notices.managerCode).toHaveBeenCalledWith('used', 'u1', 'm1');
    });

    it('a wrong code neither audits nor notifies', async () => {
      prisma.otpCode.findMany.mockResolvedValue([
        otpRow({ channel: 'MANAGER', code: otpHash('999999') }),
      ]);
      await service.verifyDriverOtp(VALID_PHONE, '123456').catch(() => {});
      expect(audit.record).not.toHaveBeenCalled();
      expect(notices.managerCode).not.toHaveBeenCalled();
    });

    it('signs a token and consumes the OTP on success', async () => {
      prisma.otpCode.findMany.mockResolvedValue([otpRow()]);

      const res = await service.verifyDriverOtp(VALID_PHONE, '123456');

      expect(res.access_token).toBe('access.jwt');
      // All pending OTPs for the phone are invalidated.
      expect(prisma.otpCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phone: VALID_PHONE, usedAt: null },
        }),
      );
    });
  });

  // ─── requestDriverOtp: channels, cooldown, no enumeration ──────────────────
  describe('requestDriverOtp', () => {
    it.each([
      ['an unknown phone', null],
      ['a manager account', userRow({ role: 'MANAGER' })],
      ['an inactive driver', userRow({ isActive: false })],
    ])('returns ok and sends nothing for %s', async (_, row) => {
      prisma.user.findUnique.mockResolvedValue(row);
      for (const ch of ['sms', 'manager', 'whatsapp']) {
        await expect(
          service.requestDriverOtp(VALID_PHONE, ch),
        ).resolves.toEqual({ ok: true });
      }
      expect(sms.send).not.toHaveBeenCalled();
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('enforces the per-channel resend cooldown (HTTP 429)', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'recent' });
      const err = await service
        .requestDriverOtp(VALID_PHONE)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(prisma.otpCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: VALID_PHONE,
            channel: 'SMS',
          }),
        }),
      );
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('sms (default): stores a hashed 5-minute code, sends it, audits it', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());
      await expect(
        service.requestDriverOtp(VALID_PHONE, undefined, '1.2.3.4'),
      ).resolves.toEqual({ ok: true });
      const row = prisma.otpCode.create.mock.calls[0][0].data;
      expect(row.channel).toBe('SMS');
      const sent = sms.send.mock.calls[0][1] as string;
      const code = sent.match(/\d{6}/)![0];
      expect(row.code).toBe(otpHash(code));
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        5 * 60_000,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CODE_ISSUED',
          channel: 'SMS',
          driverId: 'u1',
          ip: '1.2.3.4',
        }),
      );
    });

    it('sms text follows the driver interface language', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ uiLocale: 'PL' }));
      await service.requestDriverOtp(VALID_PHONE, 'sms');
      expect(sms.send.mock.calls[0][1]).toMatch(/^Twój kod IS Fleet: \d{6}$/);
    });

    it('sms switched off (LOGIN_SMS_ENABLED=false): ok, nothing stored or sent', async () => {
      setEnv({ LOGIN_SMS_ENABLED: 'false' });
      prisma.user.findUnique.mockResolvedValue(userRow());
      await expect(service.requestDriverOtp(VALID_PHONE, 'sms')).resolves.toEqual(
        { ok: true },
      );
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('a removed method (email) is just unknown: ok, nothing sent', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());
      await expect(
        service.requestDriverOtp(VALID_PHONE, 'email'),
      ).resolves.toEqual({ ok: true });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it.each(['whatsapp', 'telegram', 'pigeon'])(
      '%s is off (flag unset / unknown) — ok, nothing stored or sent',
      async (ch) => {
        prisma.user.findUnique.mockResolvedValue(userRow());
        await expect(
          service.requestDriverOtp(VALID_PHONE, ch),
        ).resolves.toEqual({ ok: true });
        expect(prisma.otpCode.create).not.toHaveBeenCalled();
        expect(sms.send).not.toHaveBeenCalled();
      },
    );

    it('whatsapp with its flag on: code stored (stub delivery, no SMS)', async () => {
      setEnv({ LOGIN_WHATSAPP_ENABLED: 'true' });
      prisma.user.findUnique.mockResolvedValue(userRow());
      await service.requestDriverOtp(VALID_PHONE, 'whatsapp');
      expect(prisma.otpCode.create.mock.calls[0][0].data.channel).toBe(
        'WHATSAPP',
      );
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('a delivery failure still answers ok', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());
      sms.send.mockRejectedValue(new Error('twilio 21608'));
      await expect(service.requestDriverOtp(VALID_PHONE)).resolves.toEqual({
        ok: true,
      });
    });

    describe('store-review phone', () => {
      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue(userRow());
      });

      it('stores the fixed code and sends no SMS', async () => {
        setEnv({ REVIEW_PHONE: VALID_PHONE, REVIEW_OTP: '424242' });
        await service.requestDriverOtp(VALID_PHONE);
        expect(prisma.otpCode.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            phone: VALID_PHONE,
            code: otpHash('424242'),
          }),
        });
        expect(sms.send).not.toHaveBeenCalled();
      });

      it('leaves other phones on the normal SMS flow', async () => {
        setEnv({ REVIEW_PHONE: '+48500000000', REVIEW_OTP: '424242' });
        await service.requestDriverOtp(VALID_PHONE);
        expect(sms.send).toHaveBeenCalled();
        expect(prisma.otpCode.create.mock.calls[0][0].data.code).not.toBe(
          otpHash('424242'),
        );
      });

      it('still works with SMS switched off — reviewers must get in', async () => {
        setEnv({
          REVIEW_PHONE: VALID_PHONE,
          REVIEW_OTP: '424242',
          LOGIN_SMS_ENABLED: 'false',
        });
        await service.requestDriverOtp(VALID_PHONE);
        expect(prisma.otpCode.create.mock.calls[0][0].data.code).toBe(
          otpHash('424242'),
        );
      });

      it('stays off when REVIEW_OTP is not 6 digits', async () => {
        setEnv({ REVIEW_PHONE: VALID_PHONE, REVIEW_OTP: '1234' });
        await service.requestDriverOtp(VALID_PHONE);
        expect(sms.send).toHaveBeenCalled();
      });
    });
  });

  // ─── driverOtpChannels: what the "didn't get the code?" panel offers ───────
  describe('driverOtpChannels', () => {
    it('defaults: SMS + email to the manager (manager last)', () => {
      expect(service.driverOtpChannels()).toEqual({
        channels: ['sms', 'manager'],
      });
    });

    it('each method follows its own flag', () => {
      setEnv({
        LOGIN_SMS_ENABLED: 'false',
        LOGIN_WHATSAPP_ENABLED: 'true',
        LOGIN_TELEGRAM_ENABLED: 'true',
        TELEGRAM_GATEWAY_URL: 'https://gateway.example',
        TELEGRAM_GATEWAY_TOKEN: 'tok',
        LOGIN_MANAGER_EMAIL_ENABLED: 'false',
      });
      expect(service.driverOtpChannels().channels).toEqual([
        'whatsapp',
        'telegram',
      ]);
    });

    it('only the exact string "true"/"false" flips a flag', () => {
      setEnv({ LOGIN_SMS_ENABLED: 'no', LOGIN_TELEGRAM_ENABLED: '1' });
      expect(service.driverOtpChannels().channels).toEqual(['sms', 'manager']);
    });
  });

  // ─── Through the manager ──────────────────────────────────────────────────
  describe('requestDriverOtp(channel=manager)', () => {
    const manager = (over: Record<string, unknown> = {}) => ({
      id: 'm1',
      email: 'boss@example.com',
      isActive: true,
      companyId: 'c1',
      uiLocale: 'PL',
      ...over,
    });
    const withManager = (m: unknown) =>
      userRow({ currentTruck: m === undefined ? null : { manager: m } });

    it.each([
      ['no truck', undefined],
      ['a truck without a manager', null],
      ['an inactive manager', manager({ isActive: false })],
      ['a manager in another company', manager({ companyId: 'c2' })],
      ['a manager without email', manager({ email: null })],
    ])('returns ok and sends nothing with %s', async (_, m) => {
      prisma.user.findUnique.mockResolvedValue(withManager(m));
      await expect(
        service.requestDriverOtp(VALID_PHONE, 'manager'),
      ).resolves.toEqual({ ok: true });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
      expect(notices.managerCode).not.toHaveBeenCalled();
    });

    it('switched off (LOGIN_MANAGER_EMAIL_ENABLED=false): ok, nothing sent', async () => {
      setEnv({ LOGIN_MANAGER_EMAIL_ENABLED: 'false' });
      prisma.user.findUnique.mockResolvedValue(withManager(manager()));
      await expect(
        service.requestDriverOtp(VALID_PHONE, 'manager'),
      ).resolves.toEqual({ ok: true });
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('has its own cooldown', async () => {
      prisma.user.findUnique.mockResolvedValue(withManager(manager()));
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'recent' });
      const err = await service
        .requestDriverOtp(VALID_PHONE, 'manager')
        .catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(prisma.otpCode.findFirst.mock.calls[0][0].where.channel).toBe(
        'MANAGER',
      );
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
    });

    it('emails a hashed 15-minute code to the truck manager, audits and tells the driver', async () => {
      prisma.user.findUnique.mockResolvedValue(withManager(manager()));
      await service.requestDriverOtp(VALID_PHONE, 'manager', '1.2.3.4');

      const [to, opts] = mail.sendDriverLoginCode.mock.calls[0];
      expect(to).toBe('boss@example.com');
      expect(opts).toEqual(
        expect.objectContaining({ locale: 'PL', ttlMinutes: 15 }),
      );
      expect(opts.driverPhone).not.toContain('971234567');
      const row = prisma.otpCode.create.mock.calls[0][0].data;
      expect(row).toEqual(
        expect.objectContaining({
          code: otpHash(opts.code),
          channel: 'MANAGER',
          issuedById: 'm1',
        }),
      );
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CODE_ISSUED',
          channel: 'MANAGER',
          driverId: 'u1',
          actorId: 'u1',
          ip: '1.2.3.4',
        }),
      );
      expect(notices.managerCode).toHaveBeenCalledWith('issued', 'u1', 'm1');
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('still answers ok when the email fails', async () => {
      prisma.user.findUnique.mockResolvedValue(withManager(manager()));
      mail.sendDriverLoginCode.mockRejectedValue(new Error('resend down'));
      await expect(
        service.requestDriverOtp(VALID_PHONE, 'manager'),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('issueDriverLoginCode', () => {
    const requester = { id: 'm1', companyId: 'c1', isActive: true };
    const driver = (over: Record<string, unknown> = {}) => ({
      id: 'd1',
      role: 'DRIVER',
      phone: VALID_PHONE,
      isActive: true,
      companyId: 'c1',
      deletedAt: null,
      currentTruck: { managerId: 'm1' },
      ...over,
    });
    const rows = (req: unknown, drv: unknown) =>
      prisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 'm1' ? req : drv),
      );
    const enable = () => setEnv({ MANAGER_LOGIN_CODE_ENABLED: 'true' });

    it('is refused while MANAGER_LOGIN_CODE_ENABLED is off (default)', async () => {
      rows(requester, driver());
      await expect(service.issueDriverLoginCode('m1', 'd1')).rejects.toThrow(
        /featureDisabled/,
      );
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(service.managerLoginCodeEnabled()).toBe(false);
    });

    it('issues a 15-minute MANAGER code, audits it and tells the driver', async () => {
      enable();
      rows(requester, driver());
      prisma.otpCode.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'o1', ...data }),
      );
      const res = await service.issueDriverLoginCode('m1', 'd1', '5.6.7.8');

      expect(res.code).toMatch(/^\d{6}$/);
      expect(res.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(prisma.otpCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: VALID_PHONE,
          userId: 'd1',
          code: otpHash(res.code),
          channel: 'MANAGER',
          issuedById: 'm1',
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CODE_ISSUED',
          actorId: 'm1',
          driverId: 'd1',
          ip: '5.6.7.8',
        }),
      );
      expect(notices.managerCode).toHaveBeenCalledWith('issued', 'd1', 'm1');
    });

    it.each([
      [
        'another manager of the same company',
        driver({ currentTruck: { managerId: 'm2' } }),
      ],
      ['anyone, for a driver without a truck', driver({ currentTruck: null })],
      ['a driver of another company', driver({ companyId: 'c2' })],
      ['a non-driver', driver({ role: 'MANAGER' })],
      ['a missing driver', null],
    ])('refuses %s', async (_, drv) => {
      enable();
      rows(requester, drv);
      await expect(
        service.issueDriverLoginCode('m1', 'd1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(notices.managerCode).not.toHaveBeenCalled();
    });

    it('refuses a deactivated requester', async () => {
      enable();
      rows({ ...requester, isActive: false }, driver());
      await expect(
        service.issueDriverLoginCode('m1', 'd1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an inactive / deleted driver', async () => {
      enable();
      rows(requester, driver({ deletedAt: new Date() }));
      await expect(
        service.issueDriverLoginCode('m1', 'd1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });
  });

  // ─── password reset (anti-enumeration + token validation) ───────────────────
  describe('requestPasswordReset', () => {
    it('returns ok without minting a token for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.requestPasswordReset('x@y.co')).resolves.toEqual({
        ok: true,
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('returns ok without a token for a passwordless (driver) account', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ password: null }));
      await expect(service.requestPasswordReset('x@y.co')).resolves.toEqual({
        ok: true,
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('invalidates old tokens and mints a new one for a real user', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: 'MANAGER' }));
      await service.requestPasswordReset('x@y.co');
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    });

    it('stores only the hash; the raw token goes out in the link', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: 'MANAGER' }));
      await service.requestPasswordReset('x@y.co');
      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data
        .token as string;
      const link = mail.sendPasswordReset.mock.calls[0][1] as string;
      const raw = new URL(link).searchParams.get('token')!;
      expect(stored).toBe(sha256(raw));
      expect(stored).not.toBe(raw);
    });
  });

  describe('resetPassword', () => {
    it('looks the token up by its hash', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('tok', 'newpw')).rejects.toThrow();
      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { token: sha256('tok') },
      });
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('tok', 'newpw')).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });
      await expect(service.resetPassword('tok', 'newpw')).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.resetPassword('tok', 'newpw')).rejects.toThrow();
    });

    it('hashes the new password and consumes the token atomically', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });
      mockedBcrypt.hash.mockResolvedValue('newhash' as never);

      await expect(service.resetPassword('tok', 'newpw')).resolves.toEqual({
        ok: true,
      });
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newpw', 10);
      // Both writes go through a single transaction.
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── register via a company link (first / extra team lead) ────────────────
  describe('register with a company invite link', () => {
    const dto = {
      inviteToken: 'tok',
      firstName: 'Anna',
      email: 'anna@acme.eu',
      password: 'secret123',
    };
    let tx: {
      company: { updateMany: jest.Mock };
      user: { create: jest.Mock };
    };

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue(null); // not a user invite
      prisma.company.findFirst.mockResolvedValue({ id: 'c1', users: [] });
      tx = {
        company: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'u2',
            role: 'TEAMLEAD',
            companyId: 'c1',
            firstName: 'Anna',
          }),
        },
      };
      prisma.$transaction.mockImplementation((fn) => fn(tx));
    });

    it('only accepts a link that has not expired', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.register(dto as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.company.findFirst.mock.calls[0][0].where).toEqual({
        inviteToken: 'tok',
        inviteExpiry: { gt: expect.any(Date) },
      });
    });

    it('uses the link up when the team lead signs up', async () => {
      await service.register(dto as never);
      expect(tx.company.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', inviteToken: 'tok' },
        data: { inviteToken: null, inviteExpiry: null },
      });
      expect(tx.user.create).toHaveBeenCalled();
    });

    it('refuses a second sign-up that lost the race for the link', async () => {
      tx.company.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.register(dto as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.user.create).not.toHaveBeenCalled();
    });
  });
});

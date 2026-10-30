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
  password: 'hashed',
  status: 'ONLINE',
  statusUntil: null,
  ...over,
});

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
  let mail: { sendPasswordReset: jest.Mock; sendDriverLoginCode: jest.Mock };
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

  // ─── Driver login without SMS ───────────────────────────────────────────────
  describe('requestDriverOtpViaManager', () => {
    const manager = (over: Record<string, unknown> = {}) => ({
      id: 'm1',
      email: 'boss@example.com',
      isActive: true,
      companyId: 'c1',
      uiLocale: 'PL',
      ...over,
    });

    it('returns ok and sends nothing for an unknown phone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.requestDriverOtpViaManager(VALID_PHONE),
      ).resolves.toEqual({ ok: true });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
    });

    it.each([
      ['no manager', null],
      ['an inactive manager', manager({ isActive: false })],
      ['a manager in another company', manager({ companyId: 'c2' })],
      ['a manager without email', manager({ email: null })],
    ])('returns ok and sends nothing with %s', async (_, m) => {
      prisma.user.findUnique.mockResolvedValue(userRow({ manager: m }));
      await expect(
        service.requestDriverOtpViaManager(VALID_PHONE),
      ).resolves.toEqual({ ok: true });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
    });

    it('shares the per-phone cooldown with SMS codes', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ manager: manager() }));
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'recent' });
      const err = await service
        .requestDriverOtpViaManager(VALID_PHONE)
        .catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(mail.sendDriverLoginCode).not.toHaveBeenCalled();
    });

    it('stores only the hash and emails the code to the assigned manager', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ manager: manager() }));
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await service.requestDriverOtpViaManager(VALID_PHONE);

      const [to, opts] = mail.sendDriverLoginCode.mock.calls[0];
      expect(to).toBe('boss@example.com');
      expect(opts).toEqual(
        expect.objectContaining({ locale: 'PL', ttlMinutes: 15 }),
      );
      expect(opts.code).toMatch(/^\d{6}$/);
      expect(opts.driverPhone).not.toContain('971234567');
      const row = prisma.otpCode.create.mock.calls[0][0].data;
      expect(row.code).toBe(otpHash(opts.code));
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        14 * 60_000,
      );
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('still answers ok when the email fails', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ manager: manager() }));
      prisma.otpCode.findFirst.mockResolvedValue(null);
      mail.sendDriverLoginCode.mockRejectedValue(new Error('resend down'));
      await expect(
        service.requestDriverOtpViaManager(VALID_PHONE),
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
      managerId: 'm1',
      deletedAt: null,
      ...over,
    });
    const rows = (req: unknown, drv: unknown) =>
      prisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 'm1' ? req : drv),
      );

    it('issues a single-use 15-minute code to the assigned manager', async () => {
      rows(requester, driver());
      const res = await service.issueDriverLoginCode('m1', 'd1');

      expect(res.code).toMatch(/^\d{6}$/);
      expect(res.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        14 * 60_000,
      );
      expect(prisma.otpCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: VALID_PHONE,
          userId: 'd1',
          code: otpHash(res.code),
        }),
      });
    });

    it.each([
      ['another manager of the same company', driver({ managerId: 'm2' })],
      ['a driver of another company', driver({ companyId: 'c2' })],
      ['a non-driver', driver({ role: 'MANAGER' })],
      ['a missing driver', null],
    ])('refuses %s', async (_, drv) => {
      rows(requester, drv);
      await expect(
        service.issueDriverLoginCode('m1', 'd1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('refuses a deactivated requester', async () => {
      rows({ ...requester, isActive: false }, driver());
      await expect(
        service.issueDriverLoginCode('m1', 'd1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an inactive / deleted driver', async () => {
      rows(requester, driver({ deletedAt: new Date() }));
      await expect(
        service.issueDriverLoginCode('m1', 'd1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });
  });

  // ─── requestDriverOtp (anti-enumeration + cooldown) ─────────────────────────
  describe('requestDriverOtp', () => {
    it('returns ok without sending SMS for an unknown / non-driver phone', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.requestDriverOtp(VALID_PHONE)).resolves.toEqual({
        ok: true,
      });
      expect(sms.send).not.toHaveBeenCalled();
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('enforces the resend cooldown (HTTP 429)', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());
      prisma.otpCode.findFirst.mockResolvedValue({ id: 'recent' });
      const err = await service
        .requestDriverOtp(VALID_PHONE)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('creates an OTP and sends an SMS for an active driver', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(service.requestDriverOtp(VALID_PHONE)).resolves.toEqual({
        ok: true,
      });
      expect(prisma.otpCode.create).toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledWith(
        VALID_PHONE,
        expect.stringContaining('IS Fleet'),
      );
    });

    describe('store-review phone', () => {
      const env = (vars: Record<string, string>) =>
        config.get.mockImplementation((k: string) => vars[k]);

      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue(userRow());
        prisma.otpCode.findFirst.mockResolvedValue(null);
      });

      it('stores the fixed code and sends no SMS', async () => {
        env({ REVIEW_PHONE: VALID_PHONE, REVIEW_OTP: '424242' });
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
        env({ REVIEW_PHONE: '+48500000000', REVIEW_OTP: '424242' });
        await service.requestDriverOtp(VALID_PHONE);
        expect(sms.send).toHaveBeenCalled();
        expect(prisma.otpCode.create.mock.calls[0][0].data.code).not.toBe(
          otpHash('424242'),
        );
      });

      it('stays off when REVIEW_OTP is not 6 digits', async () => {
        env({ REVIEW_PHONE: VALID_PHONE, REVIEW_OTP: '1234' });
        await service.requestDriverOtp(VALID_PHONE);
        expect(sms.send).toHaveBeenCalled();
      });
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

import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
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
  let mail: { sendPasswordReset: jest.Mock };
  let emit: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockResolvedValue({
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
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
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
        { provide: ConfigService, useValue: { get: jest.fn() } },
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
      // markSessionStart flips presence + broadcasts.
      expect(prisma.user.update).toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        'userStatusChanged',
        expect.objectContaining({ userId: 'u1' }),
      );
      // A refresh row was persisted.
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
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

    it('rejects a revoked token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'r1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        user: userRow(),
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
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
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  // ─── verifyDriverOtp ────────────────────────────────────────────────────────
  describe('verifyDriverOtp', () => {
    it('rejects an unparseable phone', async () => {
      await expect(
        service.verifyDriverOtp('not-a-phone', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when there is no pending OTP', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('locks the OTP after too many attempts', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1',
        code: '000000',
        attempts: 5,
        user: userRow(),
      });
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toThrow(/tooManyAttempts/);
      // Burns the OTP so a fresh one is required.
      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });

    it('increments attempts on a wrong code', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1',
        code: '654321',
        attempts: 1,
        user: userRow(),
      });
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { attempts: { increment: 1 } },
        }),
      );
    });

    it('forbids a non-driver / inactive account even with the right code', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1',
        code: '123456',
        attempts: 0,
        user: userRow({ role: 'MANAGER' }),
      });
      await expect(
        service.verifyDriverOtp(VALID_PHONE, '123456'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('signs a token and consumes the OTP on success', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({
        id: 'o1',
        code: '123456',
        attempts: 0,
        user: userRow(),
      });

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
  });

  describe('resetPassword', () => {
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
});

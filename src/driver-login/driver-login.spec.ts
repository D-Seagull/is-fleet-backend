import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  DriverLoginNoticeService,
  formatAt,
} from './driver-login-notice.service';
import { EmailVerificationService } from './email-verification.service';
import { AuthAuditService } from './auth-audit.service';
import { maskEmail } from './otp-channels';

// PushService → expo-server-sdk is ESM-only; the push mock below is enough.
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('dmytro@gmail.com')).toBe('d***@gmail.com');
  });
  it('hides a malformed address entirely', () => {
    expect(maskEmail('@x')).toBe('***');
  });
});

describe('formatAt', () => {
  it("uses the driver's time zone", () => {
    const at = new Date('2026-10-31T12:05:00Z');
    expect(formatAt(at, 'EN', 'Europe/Kyiv')).toContain('14:05');
    expect(formatAt(at, 'EN', 'Europe/Berlin')).toContain('13:05');
  });
  it('falls back instead of throwing on a bad time zone', () => {
    expect(() => formatAt(new Date(), 'UK', 'Not/AZone')).not.toThrow();
  });
});

describe('AuthAuditService', () => {
  it('writes a row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const svc = new AuthAuditService({ authAuditLog: { create } } as never);
    await svc.record({
      action: 'CODE_USED',
      driverId: 'd1',
      actorId: 'd1',
      companyId: 'c1',
      channel: 'SMS',
      ip: '1.2.3.4',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        action: 'CODE_USED',
        driverId: 'd1',
        actorId: 'd1',
        companyId: 'c1',
        channel: 'SMS',
        ip: '1.2.3.4',
      },
    });
  });
  it('never throws — auditing must not block a sign-in', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const svc = new AuthAuditService({ authAuditLog: { create } } as never);
    await expect(
      svc.record({ action: 'CODE_ISSUED' }),
    ).resolves.toBeUndefined();
  });
});

describe('DriverLoginNoticeService', () => {
  const findUnique = jest.fn();
  const push = { sendLocalizedToUsers: jest.fn().mockResolvedValue(undefined) };
  const sms = { send: jest.fn().mockResolvedValue(undefined) };
  const svc = new DriverLoginNoticeService(
    { user: { findUnique } } as never,
    push as never,
    sms as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === 'd1'
          ? { phone: '+380971234567', uiLocale: 'EN', timezone: 'Europe/Kyiv' }
          : { firstName: 'Olek', lastName: 'Sandr' },
      ),
    );
  });

  it.each(['issued', 'used'] as const)(
    'manager code %s → push (even with the app open) + SMS naming the manager and time',
    async (kind) => {
      const at = new Date('2026-10-31T12:05:00Z');
      await svc.managerCode(kind, 'd1', 'm1', at);

      const [ids, build, extra] = push.sendLocalizedToUsers.mock.calls[0];
      expect(ids).toEqual(['d1']);
      expect(extra.whenActive).toBe('push');
      const { body } = build('EN');
      expect(body).toContain('Olek Sandr');
      expect(body).toContain('14:05');

      const [to, text] = sms.send.mock.calls[0];
      expect(to).toBe('+380971234567');
      expect(text).toContain('Olek Sandr');
      expect(text).toContain('14:05');
    },
  );

  it('swallows a failing push / SMS', async () => {
    sms.send.mockRejectedValueOnce(new Error('twilio'));
    await expect(svc.managerCode('used', 'd1', 'm1')).resolves.toBeUndefined();
  });
});

describe('EmailVerificationService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    emailVerificationToken: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const mail = {
    sendDriverEmailVerification: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn().mockReturnValue('https://app.example') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new EmailVerificationService(
    prisma as never,
    mail as never,
    config as never,
    audit as never,
  );
  const driver = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    role: 'DRIVER',
    email: 'ann@example.com',
    emailVerifiedAt: null,
    uiLocale: 'PL',
    companyId: 'c1',
    ...over,
  });

  beforeEach(() => jest.clearAllMocks());

  describe('send', () => {
    it('stores only a hash and mails the link in the driver language', async () => {
      prisma.user.findUnique.mockResolvedValue(driver());
      await svc.send('d1', 'm1', '1.2.3.4');

      const [to, link, hours, locale] =
        mail.sendDriverEmailVerification.mock.calls[0];
      expect(to).toBe('ann@example.com');
      expect(locale).toBe('PL');
      expect(hours).toBe(48);
      const raw = new URL(link).searchParams.get('token')!;
      expect(link.startsWith('https://app.example/verify-email?token=')).toBe(
        true,
      );
      const row = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      expect(row.tokenHash).toBe(sha256(raw));
      expect(JSON.stringify(row)).not.toContain(raw);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMAIL_VERIFICATION_SENT',
          actorId: 'm1',
        }),
      );
    });

    it('does nothing for an already verified email', async () => {
      prisma.user.findUnique.mockResolvedValue(
        driver({ emailVerifiedAt: new Date() }),
      );
      await expect(svc.send('d1', 'm1')).resolves.toEqual({
        ok: true,
        alreadyVerified: true,
      });
      expect(mail.sendDriverEmailVerification).not.toHaveBeenCalled();
    });

    it('refuses non-drivers and drivers without email', async () => {
      prisma.user.findUnique.mockResolvedValue(driver({ role: 'MANAGER' }));
      await expect(svc.send('d1', 'm1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      prisma.user.findUnique.mockResolvedValue(driver({ email: null }));
      await expect(svc.send('d1', 'm1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('confirm', () => {
    const token = (over: Record<string, unknown> = {}) => ({
      id: 't1',
      userId: 'd1',
      email: 'ann@example.com',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'd1', email: 'ann@example.com', companyId: 'c1' },
      ...over,
    });

    it('marks the email verified and burns the token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(token());
      await expect(svc.confirm('a'.repeat(43))).resolves.toEqual({ ok: true });
      expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: sha256('a'.repeat(43)) },
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EMAIL_VERIFIED' }),
      );
    });

    it.each([
      ['unknown', null],
      ['used', token({ usedAt: new Date() })],
      ['expired', token({ expiresAt: new Date(Date.now() - 1) })],
      [
        'for an address since replaced',
        token({
          user: { id: 'd1', email: 'new@example.com', companyId: 'c1' },
        }),
      ],
    ])('rejects a %s token', async (_, row) => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(row);
      await expect(svc.confirm('x'.repeat(43))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});

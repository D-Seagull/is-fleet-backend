import {
  DriverLoginNoticeService,
  formatAt,
} from './driver-login-notice.service';
import { AuthAuditService } from './auth-audit.service';
import { OtpDeliveryService } from './otp-delivery.service';

// PushService (via SupportContactService) → expo-server-sdk is ESM-only.
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));

describe('formatAt', () => {
  it("uses the driver's time zone, 24-hour", () => {
    const at = new Date('2026-10-31T12:05:00Z');
    expect(formatAt(at, 'EN', 'Europe/Kyiv')).toContain('14:05');
    expect(formatAt(at, 'EN', 'Europe/Berlin')).toContain('13:05');
  });
  it('falls back instead of throwing on a bad time zone', () => {
    expect(() => formatAt(new Date(), 'UK', 'Not/AZone')).not.toThrow();
  });
});

describe('OtpDeliveryService flags', () => {
  const make = (env: Record<string, string>) =>
    new OtpDeliveryService(
      { send: jest.fn() } as never,
      { get: (k: string) => env[k] } as never,
    );

  it('defaults: SMS and email-to-manager on, WhatsApp / Telegram off', () => {
    expect(make({}).enabledMethods()).toEqual(['sms', 'manager']);
  });

  it('a switched-off method has no channel', () => {
    const svc = make({ LOGIN_SMS_ENABLED: 'false' });
    expect(svc.direct('sms')).toBeNull();
    expect(svc.isEnabled('sms')).toBe(false);
  });

  it('unknown methods and "manager" are never direct channels', () => {
    const svc = make({});
    expect(svc.direct('email')).toBeNull();
    expect(svc.direct('manager')).toBeNull();
    expect(svc.isEnabled('email')).toBe(false);
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
  const contact = { notify: jest.fn().mockResolvedValue(undefined) };
  const svc = new DriverLoginNoticeService(
    { user: { findUnique } } as never,
    contact as never,
  );
  const at = new Date('2026-10-31T12:05:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === 'd1'
          ? { timezone: 'Europe/Kyiv' }
          : { firstName: 'Olek', lastName: 'Sandr' },
      ),
    );
  });

  it.each(['issued', 'used'] as const)(
    'manager code %s → a message from IS Fleet contact naming the manager and time',
    async (kind) => {
      await svc.managerCode(kind, 'd1', 'm1', at);
      const [to, build] = contact.notify.mock.calls[0];
      expect(to).toBe('d1');
      const text = build('EN') as string;
      expect(text).toContain('Olek Sandr');
      expect(text).toContain('14:05');
      expect(build('PL')).not.toBe(text);
    },
  );

  it('phone changed → message with the new number', async () => {
    await svc.phoneChanged('d1', 'm1', '+48500111222', at);
    const [to, build] = contact.notify.mock.calls[0];
    expect(to).toBe('d1');
    const text = build('UK') as string;
    expect(text).toContain('+48500111222');
    expect(text).toContain('Olek Sandr');
  });
});

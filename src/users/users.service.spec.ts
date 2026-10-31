import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { MailService } from 'src/mail/mail.service';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { PushService } from 'src/push/push.service';
import { EmailVerificationService } from 'src/driver-login/email-verification.service';
import { DriverTransfersService } from 'src/driver-transfers/driver-transfers.service';

// expo-server-sdk is ESM-only, pulled in transitively via the gateway / push
// import chain; the real deps are useValue mocks, so this stub just keeps the
// module graph parseable under jest.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

// uuid ships ESM-only; jest doesn't transform it. Not used by the tested
// paths (activate/deactivate/upsertRating), so a plain stub suffices.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  firstName: 'Ann',
  lastName: 'Doe',
  role: 'DRIVER',
  companyId: 'c1',
  ...over,
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: Record<string, jest.Mock>;
    driverRating: Record<string, jest.Mock>;
    refreshToken: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let transfers: { request: jest.Mock };
  let gateway: { server: { to: jest.Mock }; disconnectSockets: jest.Mock };
  let emailVerification: { send: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    transfers = {
      request: jest
        .fn()
        .mockResolvedValue({ pending: true, code: 'DRIVER_TRANSFER_PENDING' }),
    };

    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      driverRating: { upsert: jest.fn().mockResolvedValue({ id: 'dr1' }) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    gateway = {
      server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
      disconnectSockets: jest.fn(),
    };
    emailVerification = { send: jest.fn().mockResolvedValue({ ok: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: MessagesGateway, useValue: gateway },
        { provide: PushService, useValue: {} },
        { provide: DriverTransfersService, useValue: transfers },
        { provide: EmailVerificationService, useValue: emailVerification },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  // ─── activate (company scoping) ─────────────────────────────────────────────
  describe('activate', () => {
    it('throws NotFound for a user outside the company', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.activate('u1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1', companyId: 'c1' } }),
      );
    });

    it('reactivates an in-company user', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow());
      await service.activate('u1', 'c1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: true },
      });
    });
  });

  // ─── deactivate (role permission matrix) ────────────────────────────────────
  describe('deactivate', () => {
    it('throws NotFound for an unknown / out-of-company user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.deactivate('u1', 'c1', 'ADMIN'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a non-admin from deactivating a TEAMLEAD', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'TEAMLEAD' }));
      await expect(service.deactivate('u1', 'c1', 'TEAMLEAD')).rejects.toThrow(
        /onlyAdminDeactivate/,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('forbids a manager from deactivating another manager', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'MANAGER' }));
      await expect(service.deactivate('u1', 'c1', 'MANAGER')).rejects.toThrow(
        /noPermissionDeactivate/,
      );
    });

    it('lets an admin deactivate a manager', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'MANAGER' }));
      await service.deactivate('u1', 'c1', 'ADMIN');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: false },
      });
    });

    it('lets a manager deactivate a driver', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'DRIVER' }));
      await service.deactivate('u1', 'c1', 'MANAGER');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('ends every session at once: revokes refresh tokens, drops sockets', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'DRIVER' }));
      await service.deactivate('u1', 'c1', 'MANAGER');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date), expiresAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(gateway.disconnectSockets).toHaveBeenCalledWith('u1');
    });

    it('leaves sessions alone when refused', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'TEAMLEAD' }));
      await service.deactivate('u1', 'c1', 'MANAGER').catch(() => {});
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(gateway.disconnectSockets).not.toHaveBeenCalled();
    });
  });

  // ─── driver email (sign-in fallback) ─────────────────────────────────────────
  describe('updateDriver email', () => {
    beforeEach(() => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: 'u1', companyId: 'c1' });
    });

    it('a new driver email is stored unverified and a confirmation goes out', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ email: null }));
      await service.updateDriver(
        'u1',
        'c1',
        { email: ' Ann@Example.com ' },
        'm1',
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'ann@example.com',
            emailVerifiedAt: null,
          }),
        }),
      );
      expect(emailVerification.send).toHaveBeenCalledWith('u1', 'm1');
    });

    it('the same address again changes nothing', async () => {
      prisma.user.findFirst.mockResolvedValue(
        userRow({ email: 'ann@example.com' }),
      );
      await service.updateDriver(
        'u1',
        'c1',
        { email: 'ann@example.com' },
        'm1',
      );
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
        'emailVerifiedAt',
      );
      expect(emailVerification.send).not.toHaveBeenCalled();
    });

    it('removing the email sends nothing', async () => {
      prisma.user.findFirst.mockResolvedValue(
        userRow({ email: 'ann@example.com' }),
      );
      await service.updateDriver('u1', 'c1', { email: null }, 'm1');
      expect(prisma.user.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ email: null, emailVerifiedAt: null }),
      );
      expect(emailVerification.send).not.toHaveBeenCalled();
    });

    it("refuses another user's address", async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ email: null }));
      prisma.user.findUnique.mockResolvedValue({ id: 'other' });
      await expect(
        service.updateDriver('u1', 'c1', { email: 'boss@example.com' }, 'm1'),
      ).rejects.toThrow(/emailUsedUser/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses to change a manager's (login) email here", async () => {
      prisma.user.findFirst.mockResolvedValue(
        userRow({ role: 'MANAGER', email: 'm@example.com' }),
      );
      await expect(
        service.updateDriver('u1', 'c1', { email: 'x@example.com' }, 'm1'),
      ).rejects.toThrow(/emailOnlyDrivers/);
    });
  });

  // ─── createDriver: a driver of another company moves only with consent ─────
  describe('createDriver — driver registered elsewhere', () => {
    const other = {
      id: 'drvB',
      role: 'DRIVER',
      companyId: 'cB',
      firstName: 'ivan',
      lastName: 'Kovalenko',
      phone: '+380971234567',
      language: 'UK',
    };
    const dto = { firstName: 'Ivan', phone: '+380971234567' };

    beforeEach(() => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(other);
    });

    it('409 shows initials only — no id, no full name', async () => {
      const err = await service
        .createDriver('cA', 'mgrA', dto as never)
        .catch((e: { getResponse(): unknown }) => e.getResponse());
      expect(err).toEqual(
        expect.objectContaining({
          code: 'DRIVER_EXISTS_ELSEWHERE',
          driver: { id: '', firstName: 'I.', lastName: 'K.' },
        }),
      );
    });

    it('confirmTransfer opens a consent request and moves nothing', async () => {
      const res = await service.createDriver('cA', 'mgrA', {
        ...dto,
        confirmTransfer: true,
      } as never);
      expect(res).toEqual({ pending: true, code: 'DRIVER_TRANSFER_PENDING' });
      expect(transfers.request).toHaveBeenCalledWith(other, 'cA', 'mgrA');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── getUserById (company scoping) ──────────────────────────────────────────
  describe('getUserById', () => {
    it('404s a non-admin user of another company', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getUserById('uB', 'cA')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
        id: 'uB',
        companyId: 'cA',
      });
    });

    it('returns only a public card for a platform ADMIN of another company', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'adm', firstName: 'Ops', role: 'ADMIN' });
      await expect(service.getUserById('adm', 'cA')).resolves.toEqual({
        id: 'adm',
        firstName: 'Ops',
        role: 'ADMIN',
      });
      const select = prisma.user.findFirst.mock.calls[1][0].select;
      expect(select.email).toBeUndefined();
      expect(select.phone).toBeUndefined();
    });
  });

  // ─── upsertRating (idempotent per rater, defaults) ──────────────────────────
  describe('upsertRating', () => {
    it('upserts keyed on (driver, rater) and defaults anonymous to false', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'd1' });
      await service.upsertRating('d1', 'r1', 'c1', 5, 'great');
      expect(prisma.driverRating.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId_ratedById: { driverId: 'd1', ratedById: 'r1' } },
          create: expect.objectContaining({
            driverId: 'd1',
            ratedById: 'r1',
            score: 5,
            comment: 'great',
            anonymous: false,
          }),
          update: expect.objectContaining({ score: 5, anonymous: false }),
        }),
      );
    });
  });
});

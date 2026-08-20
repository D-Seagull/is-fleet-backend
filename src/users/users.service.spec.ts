import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { MailService } from 'src/mail/mail.service';
import { MessagesGateway } from 'src/messages/messages.gateway';
import { PushService } from 'src/push/push.service';

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
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      driverRating: { upsert: jest.fn().mockResolvedValue({ id: 'dr1' }) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: MessagesGateway, useValue: { server: { to: jest.fn() } } },
        { provide: PushService, useValue: {} },
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
      await expect(
        service.deactivate('u1', 'c1', 'TEAMLEAD'),
      ).rejects.toThrow(/onlyAdminDeactivate/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('forbids a manager from deactivating another manager', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow({ role: 'MANAGER' }));
      await expect(
        service.deactivate('u1', 'c1', 'MANAGER'),
      ).rejects.toThrow(/noPermissionDeactivate/);
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
  });

  // ─── upsertRating (idempotent per rater, defaults) ──────────────────────────
  describe('upsertRating', () => {
    it('upserts keyed on (driver, rater) and defaults anonymous to false', async () => {
      await service.upsertRating('d1', 'r1', 5, 'great');
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

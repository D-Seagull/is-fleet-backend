import { createHash } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import {
  DriverTransfersService,
  TRANSFER_PENDING,
} from './driver-transfers.service';

// expo-server-sdk is ESM-only, pulled in transitively via the gateway import
// chain; every dependency here is a plain mock.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

const TOKEN = 'a'.repeat(43);
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const openTransfer = (over: Record<string, unknown> = {}) => ({
  id: 'tr1',
  driverId: 'drvB',
  fromCompanyId: 'cB',
  toCompanyId: 'cA',
  requestedById: 'mgrA',
  expiresAt: new Date(Date.now() + 60_000),
  acceptedAt: null,
  declinedAt: null,
  driver: {
    id: 'drvB',
    firstName: 'Ivan',
    role: 'DRIVER',
    companyId: 'cB',
    deletedAt: null,
  },
  toCompany: { name: 'Trans A', isActive: true },
  ...over,
});

describe('DriverTransfersService', () => {
  let prisma: {
    driverTransfer: Record<string, jest.Mock>;
    company: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    truck: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let sms: { send: jest.Mock };
  let disconnectSockets: jest.Mock;
  let service: DriverTransfersService;

  const driver = {
    id: 'drvB',
    phone: '+380971234567',
    language: 'EN',
    companyId: 'cB',
  };

  beforeEach(() => {
    prisma = {
      driverTransfer: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'tr1' }),
        delete: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ name: 'Trans A' }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mgrA' }),
        update: jest.fn().mockResolvedValue({}),
      },
      truck: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    disconnectSockets = jest.fn();
    const config = { get: jest.fn().mockReturnValue('https://app.example') };
    const gateway = {
      server: { in: jest.fn().mockReturnValue({ disconnectSockets }) },
    };
    service = new DriverTransfersService(
      prisma as never,
      sms as never,
      config as never,
      gateway as never,
    );
  });

  describe('request', () => {
    it('stores only a hash and texts the driver a link with the raw token', async () => {
      await expect(service.request(driver, 'cA', 'mgrA')).resolves.toEqual(
        TRANSFER_PENDING,
      );
      const data = prisma.driverTransfer.create.mock.calls[0][0].data;
      const [to, body] = sms.send.mock.calls[0] as [string, string];
      expect(to).toBe(driver.phone);
      expect(body).toContain('Trans A');
      const token = /driver-transfer\?token=([\w-]+)/.exec(body)?.[1] ?? '';
      expect(token.length).toBeGreaterThan(20);
      expect(data.tokenHash).toBe(sha(token));
      expect(JSON.stringify(data)).not.toContain(token);
      expect(data).toEqual(
        expect.objectContaining({
          driverId: 'drvB',
          fromCompanyId: 'cB',
          toCompanyId: 'cA',
          requestedById: 'mgrA',
        }),
      );
    });

    it('does not text again while a fresh request for the pair is open', async () => {
      prisma.driverTransfer.findFirst.mockResolvedValue({ id: 'recent' });
      await service.request(driver, 'cA', 'mgrA');
      expect(sms.send).not.toHaveBeenCalled();
      expect(prisma.driverTransfer.create).not.toHaveBeenCalled();
    });

    it('caps SMS per driver per day', async () => {
      prisma.driverTransfer.count.mockResolvedValue(5);
      await service.request(driver, 'cA', 'mgrA');
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('drops the request when the SMS cannot be delivered', async () => {
      sms.send.mockRejectedValue(new Error('21608'));
      await service.request(driver, 'cA', 'mgrA');
      expect(prisma.driverTransfer.delete).toHaveBeenCalledWith({
        where: { id: 'tr1' },
      });
    });
  });

  describe('accept / decline / lookup', () => {
    it('looks the token up by its hash', async () => {
      prisma.driverTransfer.findUnique.mockResolvedValue(openTransfer());
      await service.lookup(TOKEN);
      expect(prisma.driverTransfer.findUnique.mock.calls[0][0].where).toEqual({
        tokenHash: sha(TOKEN),
      });
    });

    it.each([
      ['unknown token', null],
      ['expired', openTransfer({ expiresAt: new Date(Date.now() - 1) })],
      ['already accepted', openTransfer({ acceptedAt: new Date() })],
      ['declined', openTransfer({ declinedAt: new Date() })],
      [
        'driver moved elsewhere meanwhile',
        openTransfer({
          driver: { ...openTransfer().driver, companyId: 'cX' },
        }),
      ],
      [
        'deleted driver',
        openTransfer({
          driver: { ...openTransfer().driver, deletedAt: new Date() },
        }),
      ],
    ])('refuses: %s', async (_label, row) => {
      prisma.driverTransfer.findUnique.mockResolvedValue(row);
      await expect(service.accept(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a non-string token without touching the DB', async () => {
      await expect(service.accept({ not: '' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.driverTransfer.findUnique).not.toHaveBeenCalled();
    });

    it('accept moves the driver to the new company and drops their sockets', async () => {
      prisma.driverTransfer.findUnique.mockResolvedValue(openTransfer());
      await expect(service.accept(TOKEN)).resolves.toEqual({
        ok: true,
        toCompanyName: 'Trans A',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'drvB' },
        data: { companyId: 'cA', managerId: 'mgrA', isActive: true },
      });
      expect(prisma.truck.updateMany).toHaveBeenCalledWith({
        where: { currentDriverId: 'drvB' },
        data: { currentDriverId: null },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(disconnectSockets).toHaveBeenCalledWith(true);
    });

    it('decline marks the request and moves nothing', async () => {
      prisma.driverTransfer.findUnique.mockResolvedValue(openTransfer());
      await service.decline(TOKEN);
      expect(prisma.driverTransfer.update).toHaveBeenCalledWith({
        where: { id: 'tr1' },
        data: { declinedAt: expect.any(Date) },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});

import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TrucksService } from './trucks.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TripChatSessionsService } from '../messages/trip-chat-sessions.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { PushService } from '../push/push.service';

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

describe('TrucksService', () => {
  let service: TrucksService;
  let prisma: {
    truck: Record<string, jest.Mock>;
    truckNote: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      truck: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      truckNote: {
        create: jest.fn().mockResolvedValue({ id: 'n1' }),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrucksService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripChatSessionsService, useValue: {} },
        { provide: MessagesGateway, useValue: { server: { to: jest.fn() } } },
        { provide: PushService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(TrucksService);
  });

  // ─── findOne (company scoping) ──────────────────────────────────────────────
  describe('findOne', () => {
    it('throws NotFound when the truck is not in the company', async () => {
      prisma.truck.findFirst.mockResolvedValue(null);
      await expect(service.findOne('tr1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.truck.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'tr1', companyId: 'c1' }),
        }),
      );
    });
  });

  // ─── remove (scoped soft-delete) ────────────────────────────────────────────
  describe('remove', () => {
    it('refuses to deactivate a truck outside the company', async () => {
      prisma.truck.findFirst.mockResolvedValue(null);
      await expect(service.remove('tr1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.truck.update).not.toHaveBeenCalled();
    });

    it('soft-deletes (isActive:false) an in-company truck', async () => {
      prisma.truck.findFirst.mockResolvedValue({ id: 'tr1', plate: 'AB123' });
      const res = await service.remove('tr1', 'c1');
      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'tr1' },
        data: { isActive: false },
      });
      expect(res.message).toContain('AB123');
    });
  });

  // ─── activate (now scoped — regression guard for the cross-company fix) ──────
  describe('activate', () => {
    it('refuses to reactivate a truck from another company', async () => {
      prisma.truck.findFirst.mockResolvedValue(null);
      await expect(service.activate('tr1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.truck.update).not.toHaveBeenCalled();
    });

    it('reactivates an in-company truck', async () => {
      prisma.truck.findFirst.mockResolvedValue({ id: 'tr1', plate: 'AB123' });
      const res = await service.activate('tr1', 'c1');
      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'tr1' },
        data: { isActive: true },
      });
      expect(res.message).toBe('Truck activated');
    });
  });

  // ─── createNote (scoped by findOne) ─────────────────────────────────────────
  describe('createNote', () => {
    it('refuses to add a note to a truck outside the company', async () => {
      prisma.truck.findFirst.mockResolvedValue(null);
      await expect(
        service.createNote('tr1', 'c1', 'u1', { content: 'hi' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.truckNote.create).not.toHaveBeenCalled();
    });

    it('creates a note on an in-company truck', async () => {
      prisma.truck.findFirst.mockResolvedValue({ id: 'tr1' });
      await service.createNote('tr1', 'c1', 'u1', { content: 'hi' } as never);
      expect(prisma.truckNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            truckId: 'tr1',
            userId: 'u1',
            content: 'hi',
          }),
        }),
      );
    });
  });

  // ─── removeNote (author-ownership guard) ────────────────────────────────────
  describe('removeNote', () => {
    it('forbids deleting a note the user did not author', async () => {
      prisma.truckNote.findFirst.mockResolvedValue(null);
      await expect(service.removeNote('n1', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.truckNote.delete).not.toHaveBeenCalled();
      // Ownership is enforced in the lookup (id + userId).
      expect(prisma.truckNote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'n1', userId: 'u1' }),
        }),
      );
    });

    it('deletes the note when the user is the author', async () => {
      prisma.truckNote.findFirst.mockResolvedValue({ id: 'n1', userId: 'u1' });
      const res = await service.removeNote('n1', 'u1');
      expect(prisma.truckNote.delete).toHaveBeenCalledWith({
        where: { id: 'n1' },
      });
      expect(res.message).toBe('Note deleted');
    });
  });
});

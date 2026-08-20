import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { TripChatSessionsService } from './trip-chat-sessions.service';
import { PushService } from '../push/push.service';
import { MessagesGateway } from './messages.gateway';

// expo-server-sdk is ESM-only, pulled in transitively via the push / gateway
// import chain; the real deps are useValue mocks, so this stub just keeps the
// module graph parseable under jest.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

// A message row shaped for the fields editMessage / remove read.
const msgRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  senderId: 'u1',
  tripId: 't1',
  content: 'hello',
  isSystem: false,
  deletedAt: null,
  createdAt: new Date(), // fresh → inside the 15-min edit window
  ...over,
});

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: { message: Record<string, jest.Mock> };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      message: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'm1' }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TranslationService, useValue: {} },
        { provide: TripChatSessionsService, useValue: {} },
        { provide: PushService, useValue: {} },
        { provide: MessagesGateway, useValue: { server: { to: jest.fn() } } },
      ],
    }).compile();

    service = moduleRef.get(MessagesService);
  });

  // ─── editMessage ────────────────────────────────────────────────────────────
  describe('editMessage', () => {
    it('rejects empty / whitespace-only content', async () => {
      await expect(
        service.editMessage('m1', 'u1', '   '),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(
        service.editMessage('m1', 'u1', 'hi'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids editing someone else’s message', async () => {
      prisma.message.findUnique.mockResolvedValue(
        msgRow({ senderId: 'other' }),
      );
      await expect(service.editMessage('m1', 'u1', 'hi')).rejects.toThrow(
        /editOwnMessages/,
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('forbids editing a deleted message', async () => {
      prisma.message.findUnique.mockResolvedValue(
        msgRow({ deletedAt: new Date() }),
      );
      await expect(service.editMessage('m1', 'u1', 'hi')).rejects.toThrow(
        /cannotEditDeleted/,
      );
    });

    it('forbids editing a system message', async () => {
      prisma.message.findUnique.mockResolvedValue(msgRow({ isSystem: true }));
      await expect(service.editMessage('m1', 'u1', 'hi')).rejects.toThrow(
        /systemMessagesNotEditable/,
      );
    });

    it('forbids editing after the 15-minute window', async () => {
      prisma.message.findUnique.mockResolvedValue(
        msgRow({ createdAt: new Date(Date.now() - 16 * 60 * 1000) }),
      );
      await expect(service.editMessage('m1', 'u1', 'hi')).rejects.toThrow(
        /editWindowPassed/,
      );
    });

    it('updates content + sets editedAt for a valid edit', async () => {
      prisma.message.findUnique.mockResolvedValue(msgRow());
      await service.editMessage('m1', 'u1', '  new text  ');
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({
            content: 'new text', // trimmed
            editedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── remove (role-based soft-delete) ────────────────────────────────────────
  describe('remove', () => {
    it('throws NotFound for an unknown message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.remove('m1', 'u1', 'DRIVER')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids a driver deleting someone else’s message', async () => {
      prisma.message.findUnique.mockResolvedValue(
        msgRow({ senderId: 'other' }),
      );
      await expect(service.remove('m1', 'u1', 'DRIVER')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('lets a driver soft-delete their own message', async () => {
      prisma.message.findUnique.mockResolvedValue(msgRow({ senderId: 'u1' }));
      const res = await service.remove('m1', 'u1', 'DRIVER');
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            content: '',
          }),
        }),
      );
      expect(res.tripId).toBe('t1');
    });

    it('lets a manager soft-delete any message', async () => {
      prisma.message.findUnique.mockResolvedValue(
        msgRow({ senderId: 'other' }),
      );
      await service.remove('m1', 'mgr', 'MANAGER');
      expect(prisma.message.update).toHaveBeenCalled();
    });
  });
});

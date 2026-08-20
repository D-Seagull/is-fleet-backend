import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { DirectMessagesGateway } from 'src/direct-messages/direct-messages.gateway';

// expo-server-sdk is ESM-only, pulled in transitively via the gateway import
// chain; the gateway is a useValue mock, so this stub keeps the graph parseable.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: {
    group: Record<string, jest.Mock>;
    groupManager: Record<string, jest.Mock>;
  };
  let emit: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      group: {
        // NOTE: update() calls findFirst twice — once for the auth check, then
        // again inside broadcastGroupUpdate (which iterates .managers). Tests
        // that reach the broadcast include managers:[] in the returned row.
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'g1' }),
      },
      groupManager: { findFirst: jest.fn() },
    };
    emit = jest.fn();
    const gateway = { server: { to: jest.fn().mockReturnValue({ emit }) } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupabaseStorageService, useValue: {} },
        { provide: DirectMessagesGateway, useValue: gateway },
      ],
    }).compile();

    service = moduleRef.get(GroupsService);
  });

  // ─── update (managers edit only their own groups) ───────────────────────────
  describe('update', () => {
    it('throws NotFound for an unknown group', async () => {
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(
        service.update('g1', 'u1', 'MANAGER', { name: 'x' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a manager editing a group they did not create', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'other' });
      await expect(
        service.update('g1', 'u1', 'MANAGER', { name: 'x' } as never),
      ).rejects.toThrow(/editOwnGroups/);
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it('lets the creating manager rename their group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'g1',
        createdBy: 'u1',
        managers: [],
      });
      await service.update('g1', 'u1', 'MANAGER', { name: 'New' } as never);
      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g1' }, data: { name: 'New' } }),
      );
    });

    it('lets an admin rename any group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'g1',
        createdBy: 'other',
        managers: [],
      });
      await service.update('g1', 'admin', 'ADMIN', { name: 'New' } as never);
      expect(prisma.group.update).toHaveBeenCalled();
    });
  });

  // ─── remove (creator-only, even for admins) ─────────────────────────────────
  describe('remove', () => {
    it('throws NotFound for an unknown / already-deleted group', async () => {
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(service.remove('g1', 'u1', 'ADMIN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forbids even an admin from deleting a group they did not create', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'g1',
        createdBy: 'other',
        name: 'Ops',
        managers: [],
      });
      await expect(service.remove('g1', 'admin', 'ADMIN')).rejects.toThrow(
        /onlyCreatorDeleteGroup/,
      );
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it('soft-deletes and broadcasts when the creator removes it', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'g1',
        createdBy: 'u1',
        name: 'Ops',
        managers: [{ managerId: 'm2' }],
      });
      await service.remove('g1', 'u1', 'MANAGER');
      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      // Fan-out to the group room + each member's personal room.
      expect(emit).toHaveBeenCalledWith('group_deleted', { id: 'g1' });
    });
  });

  // ─── assertCanEditGroup (exercised via deleteAvatar) ────────────────────────
  describe('assertCanEditGroup', () => {
    it('forbids a manager who is neither creator nor a member', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'other' });
      prisma.groupManager.findFirst.mockResolvedValue(null); // not a member
      await expect(
        service.deleteAvatar('g1', 'u1', 'MANAGER'),
      ).rejects.toThrow(/onlyGroupMembersEdit/);
    });

    it('throws NotFound when the group does not exist', async () => {
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteAvatar('g1', 'u1', 'MANAGER'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

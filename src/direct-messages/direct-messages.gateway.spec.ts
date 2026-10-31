import type { Socket } from 'socket.io';
import { NotFoundException } from '@nestjs/common';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { authenticateSocket } from 'src/common/utils/socket-auth';

// expo-server-sdk is ESM-only, pulled in transitively via the push import
// chain; every dependency here is a plain mock.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

const fakeSocket = (token?: string) =>
  ({
    id: 's1',
    handshake: { auth: token ? { token } : {}, query: {} },
    data: {},
    rooms: new Set<string>(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket & { join: jest.Mock; disconnect: jest.Mock };

const groupB = {
  id: 'gB',
  companyId: 'cB',
  type: 'MANAGERS',
  name: 'B team',
  createdBy: 'someoneB',
  managers: [],
};

describe('DirectMessagesGateway — group rooms & posting', () => {
  const jwt = { verify: jest.fn(() => ({ sub: 'tlA' })) };
  let prisma: {
    user: Record<string, jest.Mock>;
    group: Record<string, jest.Mock>;
    company: Record<string, jest.Mock>;
  };
  let groupService: { createMessage: jest.Mock; markAsRead: jest.Mock };
  let push: { sendLocalizedToUsers: jest.Mock };
  let gateway: DirectMessagesGateway;
  let emit: jest.Mock;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tlA',
          role: 'TEAMLEAD',
          companyId: 'cA',
          isActive: true,
          deletedAt: null,
          company: { isActive: true },
        }),
        findFirst: jest.fn(),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue(groupB),
        findMany: jest.fn().mockResolvedValue([]),
      },
      company: { findUnique: jest.fn() },
    };
    groupService = { createMessage: jest.fn(), markAsRead: jest.fn() };
    push = { sendLocalizedToUsers: jest.fn() };
    gateway = new DirectMessagesGateway(
      {} as never,
      groupService as never,
      jwt as never,
      prisma as never,
      push as never,
    );
    emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
  });

  async function authed() {
    const s = fakeSocket('good');
    await authenticateSocket(s, jwt as never, prisma as never);
    return s;
  }

  it('disconnects an unauthenticated socket', async () => {
    const anon = fakeSocket();
    await gateway.handleConnection(anon);
    expect(anon.disconnect).toHaveBeenCalledWith(true);
  });

  it('join_group refuses another company’s group', async () => {
    const s = await authed();
    await expect(
      gateway.handleJoinGroup(s, { groupId: 'gB' }),
    ).resolves.toEqual({
      error: 'errors.groupNotFound',
    });
    expect(s.join).not.toHaveBeenCalled();
  });

  it('send_group_message refuses another company’s group — no write, no push', async () => {
    const s = await authed();
    await expect(
      gateway.handleGroupMessage(s, { groupId: 'gB', content: 'hi' }),
    ).resolves.toEqual({ error: 'errors.groupNotFound' });
    expect(groupService.createMessage).not.toHaveBeenCalled();
    expect(push.sendLocalizedToUsers).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('mark_as_read from an unauthenticated socket writes nothing', async () => {
    const anon = fakeSocket();
    const svc = { markAsRead: jest.fn() };
    (gateway as unknown as { service: unknown }).service = svc;
    await gateway.handleMarkAsRead(anon, { senderId: 'x' });
    expect(svc.markAsRead).not.toHaveBeenCalled();
  });

  it('mark_group_read refuses another company’s group', async () => {
    const s = await authed();
    await gateway.handleMarkGroupRead(s, { groupId: 'gB' });
    expect(groupService.markAsRead).not.toHaveBeenCalled();
  });

  it('send_direct_message answers a refused reply quote instead of throwing', async () => {
    const s = await authed();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u2',
      role: 'MANAGER',
      companyId: 'cA',
    });
    const svc = {
      createMessage: jest
        .fn()
        .mockRejectedValue(new NotFoundException('errors.messageNotFound')),
    };
    (gateway as unknown as { service: unknown }).service = svc;
    await expect(
      gateway.handleMessage(s, {
        receiverId: 'u2',
        content: 'hi',
        replyToId: 'foreign',
      }),
    ).resolves.toEqual({ error: 'errors.messageNotFound' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('send_direct_message refuses a user of another company', async () => {
    const s = await authed();
    const svc = { createMessage: jest.fn() };
    (gateway as unknown as { service: unknown }).service = svc;
    prisma.user.findFirst.mockResolvedValue({
      id: 'drvB',
      role: 'DRIVER',
      companyId: 'cB',
    });
    await expect(
      gateway.handleMessage(s, { receiverId: 'drvB', content: 'hi' }),
    ).resolves.toEqual({ error: 'errors.userNotFound' });
    expect(svc.createMessage).not.toHaveBeenCalled();
  });
});

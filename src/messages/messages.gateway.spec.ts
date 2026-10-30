import type { Socket } from 'socket.io';
import { MessagesGateway } from './messages.gateway';
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
    disconnect: jest.fn(),
  }) as unknown as Socket & { join: jest.Mock; disconnect: jest.Mock };

describe('MessagesGateway — socket auth & trip rooms', () => {
  const jwt = {
    verify: jest.fn((t: string) => {
      if (t !== 'good') throw new Error('bad');
      return { sub: 'mgrA' };
    }),
  };
  let prisma: {
    user: Record<string, jest.Mock>;
    trip: Record<string, jest.Mock>;
    tripChatSession: Record<string, jest.Mock>;
  };
  let gateway: MessagesGateway;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mgrA',
          role: 'MANAGER',
          companyId: 'cA',
          isActive: true,
          deletedAt: null,
        }),
      },
      trip: { findFirst: jest.fn() },
      tripChatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    gateway = new MessagesGateway(
      {} as never,
      jwt as never,
      prisma as never,
      { attach: jest.fn() } as never,
    );
  });

  it('disconnects a socket with no / a forged token', async () => {
    const anon = fakeSocket();
    await gateway.handleConnection(anon);
    expect(anon.disconnect).toHaveBeenCalledWith(true);
    expect(anon.join).not.toHaveBeenCalled();

    const forged = fakeSocket('forged');
    await gateway.handleConnection(forged);
    expect(forged.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses joinTrip from an unauthenticated socket', async () => {
    const anon = fakeSocket();
    await expect(
      gateway.handleJoinTrip(anon, { tripId: 'company-admin-cB' }),
    ).resolves.toEqual({ error: 'unauthenticated' });
    expect(anon.join).not.toHaveBeenCalled();
  });

  it('refuses a room that is not a trip of the caller’s company', async () => {
    const s = fakeSocket('good');
    await authenticateSocket(s, jwt as never, prisma as never);

    // Not a trip id at all (e.g. another company's admin room).
    prisma.trip.findFirst.mockResolvedValueOnce(null);
    await expect(
      gateway.handleJoinTrip(s, { tripId: 'company-admin-cB' }),
    ).resolves.toEqual({ error: 'errors.tripNotFound' });

    // A real trip — of company B.
    prisma.trip.findFirst.mockResolvedValueOnce({
      id: 'tB',
      companyId: 'cB',
      driverId: 'd',
      managerId: 'm',
      truckId: 't',
    });
    await expect(gateway.handleJoinTrip(s, { tripId: 'tB' })).resolves.toEqual({
      error: 'errors.tripNotFound',
    });
    expect(s.join).not.toHaveBeenCalled();
  });

  it('joins a trip of the caller’s company', async () => {
    const s = fakeSocket('good');
    await authenticateSocket(s, jwt as never, prisma as never);
    prisma.trip.findFirst.mockResolvedValue({
      id: 'tA',
      companyId: 'cA',
      driverId: 'd',
      managerId: 'mgrA',
      truckId: 't',
    });
    await expect(gateway.handleJoinTrip(s, { tripId: 'tA' })).resolves.toEqual({
      ok: true,
    });
    expect(s.join).toHaveBeenCalledWith('tA');
  });
});

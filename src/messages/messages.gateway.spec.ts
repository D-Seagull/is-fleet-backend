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

  // ─── N1: only the CURRENT driver is in the live trip room (P1-5) ───────────
  describe('drivers and the trip room', () => {
    const tripA = {
      id: 'tA',
      companyId: 'cA',
      driverId: 'drvNew',
      managerId: 'mgrA',
      truckId: 't',
    };
    async function driverSocket(id: string) {
      prisma.user.findUnique.mockResolvedValue({
        id,
        role: 'DRIVER',
        companyId: 'cA',
        isActive: true,
        deletedAt: null,
      });
      jwt.verify.mockReturnValueOnce({ sub: id });
      const s = fakeSocket('good');
      await authenticateSocket(s, jwt as never, prisma as never);
      return s;
    }

    it('a replaced driver (only a past session) can no longer join', async () => {
      const s = await driverSocket('drvOld');
      prisma.trip.findFirst.mockResolvedValue(tripA);
      prisma.tripChatSession.findFirst.mockResolvedValue({ id: 's0' });
      await expect(
        gateway.handleJoinTrip(s, { tripId: 'tA' }),
      ).resolves.toEqual({
        error: 'errors.tripNotFound',
      });
      expect(s.join).not.toHaveBeenCalled();
    });

    it('the current driver joins', async () => {
      const s = await driverSocket('drvNew');
      prisma.trip.findFirst.mockResolvedValue(tripA);
      await expect(
        gateway.handleJoinTrip(s, { tripId: 'tA' }),
      ).resolves.toEqual({
        ok: true,
      });
      expect(s.join).toHaveBeenCalledWith('tA');
    });
  });
  // ─── Privacy: a team lead / other manager never listens to a foreign chat ──
  describe('live trip room is for the trip’s own participants', () => {
    const trip = {
      id: 'tA',
      companyId: 'cA',
      driverId: 'drv',
      managerId: 'mgrA',
      truckId: 't',
    };
    async function socketOf(id: string, role: string) {
      prisma.user.findUnique.mockResolvedValue({
        id,
        role,
        companyId: 'cA',
        isActive: true,
        deletedAt: null,
      });
      jwt.verify.mockReturnValueOnce({ sub: id });
      const s = fakeSocket('good');
      await authenticateSocket(s, jwt as never, prisma as never);
      return s;
    }

    it.each([
      ['a team lead who is not on the trip', 'tl1', 'TEAMLEAD'],
      ['another manager of the company', 'mgrB', 'MANAGER'],
    ])('refuses %s', async (_n, id, role) => {
      const s = await socketOf(id, role);
      prisma.trip.findFirst.mockResolvedValue(trip);
      await expect(
        gateway.handleJoinTrip(s, { tripId: 'tA' }),
      ).resolves.toEqual({ error: 'errors.tripNotFound' });
      expect(s.join).not.toHaveBeenCalled();
    });

    it('lets a team lead in when they ARE the trip’s manager', async () => {
      const s = await socketOf('tl1', 'TEAMLEAD');
      prisma.trip.findFirst.mockResolvedValue({ ...trip, managerId: 'tl1' });
      await expect(
        gateway.handleJoinTrip(s, { tripId: 'tA' }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('emitTripUnread fan-out', () => {
    const signal = {
      tripId: 'tA',
      truckId: 't',
      senderId: 'drv',
      senderName: 'Driver D',
      content: 'secret text',
    };
    function wire() {
      const calls: { rooms: unknown; except?: unknown; payload?: unknown }[] =
        [];
      (gateway as unknown as { server: unknown }).server = {
        to: (rooms: unknown) => {
          const c: { rooms: unknown; except?: unknown; payload?: unknown } = {
            rooms,
          };
          calls.push(c);
          const chain = {
            except: (e: unknown) => {
              c.except = e;
              return chain;
            },
            emit: (_ev: string, payload: unknown) => {
              c.payload = payload;
            },
          };
          return chain;
        },
      };
      return calls;
    }

    it('signals only the trip’s manager with sender + text, never a team lead room', () => {
      const calls = wire();
      gateway.emitTripUnread(signal, {
        companyId: 'cA',
        driverId: 'drv',
        managerId: 'mgrA',
      });
      const full = calls.find((c) => c.payload === signal);
      expect(full?.rooms).toEqual(['mgrA']);
      // The ADMIN room only gets a bare badge nudge — nothing that can chime.
      const admin = calls.find((c) => c.rooms === 'company-admin-cA');
      expect(admin?.payload).toEqual({ tripId: 'tA' });
      expect(admin?.except).toEqual(['mgrA']);
    });
  });
});

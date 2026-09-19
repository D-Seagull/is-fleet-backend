import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { TripChatSessionsService } from '../messages/trip-chat-sessions.service';
import { PushService } from '../push/push.service';
import { ReactionsService } from '../reactions/reactions.service';

// expo-server-sdk is ESM-only and gets pulled in transitively via
// MessagesGateway / PushService. The real deps are useValue mocks below, so
// this stub just keeps the module graph parseable under jest.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

describe('TripsService', () => {
  let service: TripsService;
  let prisma: {
    trip: Record<string, jest.Mock>;
    truck: Record<string, jest.Mock>;
    tripStop: Record<string, jest.Mock>;
  };
  let sessions: {
    openInitial: jest.Mock;
    closeAndOpenNew: jest.Mock;
    closeActive: jest.Mock;
  };
  let push: { sendLocalizedToUsers: jest.Mock };
  let emit: jest.Mock;
  let toRoom: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      trip: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      truck: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      tripStop: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    sessions = {
      openInitial: jest.fn().mockResolvedValue(undefined),
      closeAndOpenNew: jest.fn().mockResolvedValue({ systemMessage: null }),
      closeActive: jest.fn().mockResolvedValue(null),
    };
    push = { sendLocalizedToUsers: jest.fn().mockResolvedValue(undefined) };
    emit = jest.fn();
    toRoom = jest.fn().mockReturnValue({ emit });
    const gateway = { server: { to: toRoom } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagesGateway, useValue: gateway },
        { provide: TripChatSessionsService, useValue: sessions },
        { provide: PushService, useValue: push },
        { provide: ReactionsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(TripsService);
  });

  // ─── findOne (company scoping) ──────────────────────────────────────────────
  describe('findOne', () => {
    it('throws NotFound when the trip is not in the company', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);
      await expect(service.findOne('t1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // The company id is part of the query — cross-company reads can't match.
      expect(prisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 't1', companyId: 'c1' }),
        }),
      );
    });

    it('returns the trip when found in the company', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 't1', companyId: 'c1' });
      await expect(service.findOne('t1', 'c1')).resolves.toEqual({
        id: 't1',
        companyId: 'c1',
      });
    });
  });

  // ─── updateStatus (guarded by findOne) ──────────────────────────────────────
  describe('updateStatus', () => {
    it('refuses to update a trip outside the company', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);
      await expect(
        service.updateStatus('t1', 'c1', { status: 'ON_WAY' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('updates and broadcasts when the trip belongs to the company', async () => {
      prisma.trip.findFirst.mockResolvedValue({ id: 't1', companyId: 'c1' });
      prisma.trip.update.mockResolvedValue({ id: 't1', driverId: 'd1' });

      await service.updateStatus('t1', 'c1', { status: 'ON_WAY' } as never);

      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: { status: 'ON_WAY' },
        }),
      );
      expect(emit).toHaveBeenCalledWith('tripUpdated', { tripId: 't1' });
    });
  });

  // ─── driverUpdateStatus (ownership guard) ───────────────────────────────────
  describe('driverUpdateStatus', () => {
    it('forbids a driver from touching a trip that is not theirs', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);
      await expect(
        service.driverUpdateStatus('t1', 'd1', { status: 'ON_WAY' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
      // Ownership is enforced in the query (id + driverId).
      expect(prisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 't1', driverId: 'd1' }),
        }),
      );
    });

    it('updates the status for the trip owner', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 't1',
        driverId: 'd1',
        companyId: 'c1',
      });
      prisma.trip.update.mockResolvedValue({ id: 't1', status: 'ON_WAY' });

      const res = await service.driverUpdateStatus('t1', 'd1', {
        status: 'ON_WAY',
      } as never);

      expect(res.status).toBe('ON_WAY');
      expect(prisma.trip.update).toHaveBeenCalled();
    });
  });

  // ─── assignDriver (session churn only on real change) ───────────────────────
  describe('assignDriver', () => {
    it('throws NotFound for a trip outside the company', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);
      await expect(
        service.assignDriver('t1', 'c1', 'd2', 'mgr1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does NOT churn the chat session when the driver is unchanged', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 't1',
        companyId: 'c1',
        driverId: 'd1',
        managerId: 'm1',
      });
      prisma.trip.update.mockResolvedValue({ id: 't1', driverId: 'd1' });

      await service.assignDriver('t1', 'c1', 'd1', 'mgr1');

      expect(sessions.closeAndOpenNew).not.toHaveBeenCalled();
    });

    it('closes + reopens the chat session when the driver changes', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 't1',
        companyId: 'c1',
        driverId: 'd1',
        managerId: 'm1',
      });
      prisma.trip.update.mockResolvedValue({ id: 't1', driverId: 'd2' });
      sessions.closeAndOpenNew.mockResolvedValue({
        systemMessage: { id: 'sys1', content: '[[sys]]' },
      });

      await service.assignDriver('t1', 'c1', 'd2', 'mgr1');

      expect(sessions.closeAndOpenNew).toHaveBeenCalledWith(
        't1',
        'DRIVER_CHANGED',
        'd2',
        'm1',
        'mgr1',
      );
      // System message is broadcast to the trip room.
      expect(emit).toHaveBeenCalledWith(
        'newMessage',
        expect.objectContaining({ id: 'sys1' }),
      );
    });
  });

  // ─── findMyActiveTrip (status-rank tiebreak) ────────────────────────────────
  describe('findMyActiveTrip', () => {
    it('returns null when the driver has no active trip', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      await expect(service.findMyActiveTrip('d1')).resolves.toBeNull();
    });

    it('prefers the in-progress trip over a freshly-assigned newer one', async () => {
      // The ASSIGNED trip is newer, but the ON_WAY one is what the driver is
      // actually doing — status rank must win over createdAt.
      prisma.trip.findMany.mockResolvedValue([
        { id: 'newAssigned', status: 'ASSIGNED', createdAt: new Date(2000) },
        { id: 'onWay', status: 'ON_WAY', createdAt: new Date(1000) },
      ]);
      const res = await service.findMyActiveTrip('d1');
      expect(res?.id).toBe('onWay');
    });

    it('breaks ties within the same status by most recent', async () => {
      prisma.trip.findMany.mockResolvedValue([
        { id: 'older', status: 'ON_WAY', createdAt: new Date(1000) },
        { id: 'newer', status: 'ON_WAY', createdAt: new Date(5000) },
      ]);
      const res = await service.findMyActiveTrip('d1');
      expect(res?.id).toBe('newer');
    });
  });

  // ─── remove (company scoping + who may delete) ─────────────────────────────
  describe('remove', () => {
    const teamlead = { id: 'tl1', role: 'TEAMLEAD' };
    const trip = { id: 't1', companyId: 'c1', truckId: 'tr1', title: 'Load A' };

    it('refuses to delete a trip outside the company', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);
      await expect(service.remove('t1', 'c1', teamlead)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('lets a teamlead delete any in-company trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(trip);
      const res = await service.remove('t1', 'c1', teamlead);
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(res.message).toContain('Load A');
      // A teamlead is trusted outright, so the truck is never looked up.
      expect(prisma.truck.findUnique).not.toHaveBeenCalled();
    });

    it('lets the truck manager delete the trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(trip);
      prisma.truck.findUnique.mockResolvedValue({ managerId: 'm1' });
      await service.remove('t1', 'c1', { id: 'm1', role: 'MANAGER' });
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('refuses a manager who does not hold the truck', async () => {
      prisma.trip.findFirst.mockResolvedValue(trip);
      // The truck belongs to someone else — responsibility follows the truck,
      // not whoever happens to be in the same company.
      prisma.truck.findUnique.mockResolvedValue({ managerId: 'm2' });
      await expect(
        service.remove('t1', 'c1', { id: 'm1', role: 'MANAGER' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });
  });

  // ─── assignTruck (перепризначення рейсу на іншу машину) ────────────────────
  describe('assignTruck', () => {
    const admin = { id: 'a1', role: 'ADMIN' };
    const tripRow = {
      id: 't1',
      companyId: 'c1',
      truckId: 'truckA',
      driverId: 'driverA',
      managerId: 'm1',
      truck: { id: 'truckA', plate: 'AAA111', currentDriverId: 'driverA' },
    };
    const targetTruck = {
      id: 'truckB',
      plate: 'BBB222',
      currentDriverId: 'driverB',
    };
    const blockingTrip = {
      id: 't2',
      title: 'Load B',
      orderNumber: null,
      status: 'ON_WAY',
      driverId: 'driverB',
      driver: { id: 'driverB', firstName: 'Bob', lastName: null },
    };
    /** What trip.update returns — moveTripToTruck reads stops/title/managerId. */
    const movedTrip = (over: Record<string, unknown> = {}) => ({
      id: 't1',
      title: 'Load A',
      managerId: 'm1',
      truckId: 'truckB',
      driverId: 'driverB',
      stops: [],
      ...over,
    });

    it('refuses a manager who does not run the trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(tripRow);
      await expect(
        service.assignTruck(
          't1',
          'c1',
          { truckId: 'truckB' },
          { id: 'someoneElse', role: 'MANAGER' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('refuses a truck with no driver — there would be nobody to push to', async () => {
      prisma.trip.findFirst.mockResolvedValue(tripRow);
      prisma.truck.findFirst.mockResolvedValue({
        ...targetTruck,
        currentDriverId: null,
      });
      await expect(
        service.assignTruck('t1', 'c1', { truckId: 'truckB' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('reports a conflict instead of overwriting a truck that already runs a trip', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(tripRow)
        .mockResolvedValueOnce(blockingTrip);
      prisma.truck.findFirst.mockResolvedValue(targetTruck);

      await expect(
        service.assignTruck('t1', 'c1', { truckId: 'truckB' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      // Nothing moved — the caller has to pick a strategy first.
      expect(prisma.trip.update).not.toHaveBeenCalled();
      expect(sessions.closeAndOpenNew).not.toHaveBeenCalled();
    });

    it('moves the trip onto a free truck with its driver, and resets the status', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(tripRow)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 't1' });
      prisma.truck.findFirst.mockResolvedValue(targetTruck);
      prisma.trip.update.mockResolvedValue(movedTrip());

      await service.assignTruck('t1', 'c1', { truckId: 'truckB' }, admin);

      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: {
            truckId: 'truckB',
            driverId: 'driverB',
            status: 'ASSIGNED',
          },
        }),
      );
      // A fresh chat session for the new driver, the old one closed as a truck
      // change rather than a plain driver swap.
      expect(sessions.closeAndOpenNew).toHaveBeenCalledWith(
        't1',
        'TRUCK_CHANGED',
        'driverB',
        'm1',
        'a1',
      );
      expect(push.sendLocalizedToUsers).toHaveBeenCalledWith(
        ['driverB'],
        expect.any(Function),
        expect.objectContaining({
          data: expect.objectContaining({ type: 'NEW_TRIP', tripId: 't1' }),
        }),
      );
      // The previous driver is told too, so the trip leaves their list at once.
      expect(toRoom).toHaveBeenCalledWith('driverA');
    });

    it('swaps the two trips when asked, moving the blocking one to the freed truck', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(tripRow)
        .mockResolvedValueOnce(blockingTrip)
        .mockResolvedValueOnce({ id: 't1' });
      prisma.truck.findFirst.mockResolvedValue(targetTruck);
      prisma.trip.update
        .mockResolvedValueOnce(movedTrip())
        .mockResolvedValueOnce(
          movedTrip({ id: 't2', truckId: 'truckA', driverId: 'driverA' }),
        );

      await service.assignTruck(
        't1',
        'c1',
        { truckId: 'truckB', onConflict: 'SWAP' },
        admin,
      );

      expect(prisma.trip.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 't2' },
          data: {
            truckId: 'truckA',
            driverId: 'driverA',
            status: 'ASSIGNED',
          },
        }),
      );
      expect(sessions.closeAndOpenNew).toHaveBeenCalledTimes(2);
    });

    it('completes the blocking trip when asked, freeing the truck', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(tripRow)
        .mockResolvedValueOnce(blockingTrip)
        .mockResolvedValueOnce({ id: 't1' });
      prisma.truck.findFirst.mockResolvedValue(targetTruck);
      prisma.trip.update
        .mockResolvedValueOnce(movedTrip())
        .mockResolvedValueOnce({ id: 't2', driverId: 'driverB' });

      await service.assignTruck(
        't1',
        'c1',
        { truckId: 'truckB', onConflict: 'COMPLETE_OTHER' },
        admin,
      );

      expect(prisma.trip.update).toHaveBeenNthCalledWith(2, {
        where: { id: 't2' },
        data: { status: 'DELIVERED' },
      });
      expect(sessions.closeActive).toHaveBeenCalledWith('t2', 'TRIP_COMPLETED');
      // Only the moved trip gets a new session; the completed one just ends.
      expect(sessions.closeAndOpenNew).toHaveBeenCalledTimes(1);
    });
  });
});

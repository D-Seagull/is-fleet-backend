import { AlarmsService } from './alarms.service';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { PushService } from 'src/push/push.service';
import type { MessagesGateway } from 'src/messages/messages.gateway';

// expo-server-sdk is ESM-only and gets pulled in transitively via PushService.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

describe('AlarmsService.checkAlarms', () => {
  const time = new Date('2026-11-21T08:00:00.000Z');
  const alarm = (recurrence: 'NONE' | 'DAILY') => ({
    id: 'a1',
    title: 'Wake up',
    note: null,
    tripId: null,
    targetUserId: 'u1',
    time,
    recurrence,
    isSent: false,
    target: { id: 'u1', timezone: 'Europe/Warsaw' },
  });

  let prisma: { alarm: { findMany: jest.Mock; updateMany: jest.Mock } };
  let push: { sendToUsers: jest.Mock };
  let emit: jest.Mock;
  let service: AlarmsService;

  beforeEach(() => {
    prisma = {
      alarm: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    emit = jest.fn();
    const gateway = { server: { to: jest.fn(() => ({ emit })) } };
    service = new AlarmsService(
      prisma as unknown as PrismaService,
      push as unknown as PushService,
      gateway as unknown as MessagesGateway,
    );
  });

  it('claims a one-shot alarm as sent before ringing', async () => {
    prisma.alarm.findMany.mockResolvedValue([alarm('NONE')]);

    await service.checkAlarms();

    expect(prisma.alarm.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', time, isSent: false },
      data: { isSent: true },
    });
    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'alarmFired',
      expect.objectContaining({ id: 'a1' }),
    );
    // Claim happens first: a crash mid-ring must not leave it to ring again.
    expect(prisma.alarm.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      push.sendToUsers.mock.invocationCallOrder[0],
    );
  });

  it('moves a recurring alarm to its next time instead of marking it sent', async () => {
    prisma.alarm.findMany.mockResolvedValue([alarm('DAILY')]);

    await service.checkAlarms();

    const { data } = prisma.alarm.updateMany.mock.calls[0][0] as {
      data: { time?: Date; isSent?: boolean };
    };
    expect(data.isSent).toBeUndefined();
    expect(data.time!.getTime()).toBeGreaterThan(time.getTime());
    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when another instance already claimed the alarm', async () => {
    prisma.alarm.findMany.mockResolvedValue([alarm('NONE')]);
    prisma.alarm.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.checkAlarms();

    expect(push.sendToUsers).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('AlarmsService.findByTrip — privacy', () => {
  const trip = { driverId: 'drv', managerId: 'mgrA' };
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    trip: { findFirst: jest.fn().mockResolvedValue(trip) },
    alarm: { findMany },
  };
  const service = new AlarmsService(
    prisma as unknown as PrismaService,
    {} as PushService,
    {} as MessagesGateway,
  );
  const who = (id: string, role: string) => ({ id, role, companyId: 'cA' });

  it('refuses a team lead who is not on the trip', async () => {
    await expect(
      service.findByTrip('t1', who('tl1', 'TEAMLEAD')),
    ).rejects.toThrow('errors.noAccessTrip');
  });

  it('lets a team lead see alarms of a trip they manage, and ADMIN any', async () => {
    await expect(
      service.findByTrip('t1', who('mgrA', 'TEAMLEAD')),
    ).resolves.toEqual([]);
    await expect(
      service.findByTrip('t1', who('adm', 'ADMIN')),
    ).resolves.toEqual([]);
  });
});

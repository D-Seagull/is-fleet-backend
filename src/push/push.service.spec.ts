import { Test } from '@nestjs/testing';
import { PushService, channelFor } from './push.service';
import { PresenceService } from './presence.service';
import { FcmService } from './fcm.service';
import { PrismaService } from 'src/prisma/prisma.service';

const sent: unknown[] = [];
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
    chunkPushNotifications(messages: unknown[]) {
      return [messages];
    }
    sendPushNotificationsAsync(chunk: unknown[]) {
      sent.push(...chunk);
      return Promise.resolve(chunk.map(() => ({ status: 'ok' })));
    }
  },
}));

describe('PushService', () => {
  let service: PushService;
  let prisma: {
    user: { findMany: jest.Mock };
    pushToken: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let presence: { activeSockets: jest.Mock };

  beforeEach(async () => {
    sent.length = 0;
    prisma = {
      user: { findMany: jest.fn() },
      pushToken: {
        findMany: jest.fn(
          ({ where }: { where: { userId: { in: string[] } } }) =>
            Promise.resolve(
              where.userId.in.map((userId) => ({
                token: `tok-${userId}`,
                userId,
              })),
            ),
        ),
        deleteMany: jest.fn(),
      },
    };
    // Nobody is using the app unless a test says otherwise.
    presence = { activeSockets: jest.fn().mockResolvedValue(new Map()) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: PresenceService, useValue: presence },
        { provide: FcmService, useValue: { enabled: false, send: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PushService);
  });

  const recipients = () => (sent as { to: string }[]).map((m) => m.to);

  it('rings ONLINE, AWAY and BUSY users, but not SLEEP / VACATION', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'on', status: 'ONLINE', statusUntil: null, language: 'uk' },
      // Web sets AWAY after 15 min idle — that's when the phone must ring.
      { id: 'away', status: 'AWAY', statusUntil: null, language: 'uk' },
      { id: 'busy', status: 'BUSY', statusUntil: null, language: 'uk' },
      { id: 'sleep', status: 'SLEEP', statusUntil: null, language: 'uk' },
      { id: 'vac', status: 'VACATION', statusUntil: null, language: 'uk' },
    ]);

    await service.sendToUsers(['on', 'away', 'busy', 'sleep', 'vac'], {
      title: 't',
      body: 'b',
    });

    expect(recipients().sort()).toEqual(['tok-away', 'tok-busy', 'tok-on']);
  });

  it('passes the Android channel (it carries the custom sound)', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', status: 'ONLINE', statusUntil: null, language: 'uk' },
    ]);

    await service.sendToUsers(['u1'], {
      title: 't',
      body: 'b',
      sound: 'push_message.mp3',
      channelId: 'messages',
    });

    expect(sent[0]).toEqual(
      expect.objectContaining({
        sound: 'push_message.mp3',
        channelId: 'messages',
      }),
    );
  });

  it('leaves raw FCM tokens (the experiment) out of the Expo path', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', status: 'ONLINE', statusUntil: null, language: 'uk' },
    ]);

    await service.sendToUsers(['u1'], { title: 't', body: 'b' });

    // NULL platform (old rows) must stay in — `not` alone would drop them.
    expect(prisma.pushToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ platform: null }, { platform: { not: 'android-fcm' } }],
        }),
      }),
    );
  });

  it('sends high priority, so a locked Android phone shows it at once', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', status: 'ONLINE', statusUntil: null, language: 'uk' },
    ]);

    await service.sendToUsers(['u1'], { title: 't', body: 'b' });

    expect(sent[0]).toEqual(expect.objectContaining({ priority: 'high' }));
  });

  it('rings with the IS Fleet chime unless told otherwise', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', status: 'ONLINE', statusUntil: null, language: 'uk' },
    ]);

    await service.sendToUsers(['u1'], { title: 't', body: 'b' });
    await service.sendToUsers(['u1'], {
      title: 'alarm',
      body: 'b',
      channelId: 'default',
      sound: 'default',
    });

    expect(sent[0]).toEqual(
      expect.objectContaining({
        channelId: 'messages',
        sound: 'push_message.mp3',
      }),
    );
    expect(sent[1]).toEqual(
      expect.objectContaining({ channelId: 'default', sound: 'default' }),
    );
  });

  it('uses the new channels only on devices that created them', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'new', status: 'ONLINE', statusUntil: null, language: 'uk' },
      { id: 'old', status: 'ONLINE', statusUntil: null, language: 'uk' },
    ]);
    prisma.pushToken.findMany.mockResolvedValueOnce([
      { token: 'tok-new', userId: 'new', channels: ['chat', 'alarm'] },
      { token: 'tok-old', userId: 'old', channels: [] },
    ]);

    await service.sendToUsers(['new', 'old'], { title: 't', body: 'b' });

    const byTo = Object.fromEntries(
      (sent as { to: string; channelId: string }[]).map((m) => [
        m.to,
        m.channelId,
      ]),
    );
    expect(byTo).toEqual({ 'tok-new': 'chat', 'tok-old': 'messages' });
  });

  it('rings alarms on the alarm channel, time-sensitive on iOS', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', status: 'SLEEP', statusUntil: null, language: 'uk' },
    ]);
    prisma.pushToken.findMany.mockResolvedValueOnce([
      { token: 'tok-u1', userId: 'u1', channels: ['chat', 'alarm'] },
    ]);

    await service.sendToUsers(['u1'], {
      title: 'Wake up',
      body: '',
      ignoreDnd: true,
      channelId: 'alarm',
      sound: 'is_alarm.mp3',
      interruptionLevel: 'time-sensitive',
    });

    expect(sent[0]).toEqual(
      expect.objectContaining({
        channelId: 'alarm',
        sound: 'is_alarm.mp3',
        interruptionLevel: 'time-sensitive',
      }),
    );
  });

  describe('while the recipient is using the app', () => {
    const socket = (notices: boolean) => ({
      data: { notices },
      emit: jest.fn(),
    });

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'inApp', status: 'ONLINE', statusUntil: null, language: 'pl' },
        { id: 'away', status: 'ONLINE', statusUntil: null, language: 'uk' },
      ]);
    });

    it('shows it in-app instead of a banner over the open app', async () => {
      const s = socket(true);
      presence.activeSockets.mockResolvedValue(new Map([['inApp', [s]]]));

      await service.sendLocalizedToUsers(
        ['inApp', 'away'],
        (lang) => ({ title: `T-${lang}`, body: 'B' }),
        { data: { type: 'NEW_TRIP', tripId: 't1' } },
      );

      expect(recipients()).toEqual(['tok-away']);
      expect(s.emit).toHaveBeenCalledWith('notice', {
        title: 'T-pl',
        body: 'B',
        data: { type: 'NEW_TRIP', tripId: 't1' },
      });
    });

    it('keeps pushing clients too old to show in-app notices', async () => {
      const s = socket(false);
      presence.activeSockets.mockResolvedValue(new Map([['inApp', [s]]]));

      await service.sendToUsers(['inApp', 'away'], { title: 't', body: 'b' });

      expect(recipients().sort()).toEqual(['tok-away', 'tok-inApp']);
      expect(s.emit).not.toHaveBeenCalled();
    });

    it('sends nothing for `skip` — the app already shows it (chat)', async () => {
      const s = socket(true);
      presence.activeSockets.mockResolvedValue(new Map([['inApp', [s]]]));

      await service.sendToUsers(['inApp', 'away'], {
        title: 't',
        body: 'b',
        whenActive: 'skip',
      });

      expect(recipients()).toEqual(['tok-away']);
      expect(s.emit).not.toHaveBeenCalled();
    });

    it('still rings for `push` — alarms', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'inApp', status: 'ONLINE', statusUntil: null, language: 'pl' },
      ]);
      presence.activeSockets.mockResolvedValue(
        new Map([['inApp', [socket(true)]]]),
      );

      await service.sendToUsers(['inApp'], {
        title: 'Wake up',
        body: '',
        whenActive: 'push',
      });

      expect(recipients()).toEqual(['tok-inApp']);
      expect(presence.activeSockets).not.toHaveBeenCalled();
    });
  });

  it('channelFor falls back for older app versions, passes others through', () => {
    expect(channelFor('chat', ['chat'])).toBe('chat');
    expect(channelFor('chat', [])).toBe('messages');
    expect(channelFor('alarm', ['chat'])).toBe('default');
    expect(channelFor('default', [])).toBe('default');
  });
});

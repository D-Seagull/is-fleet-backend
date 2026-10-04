import { Test } from '@nestjs/testing';
import { PushService } from './push.service';
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

  beforeEach(async () => {
    sent.length = 0;
    prisma = {
      user: { findMany: jest.fn() },
      pushToken: {
        findMany: jest.fn(({ where }: { where: { userId: { in: string[] } } }) =>
          Promise.resolve(
            where.userId.in.map((userId) => ({ token: `tok-${userId}`, userId })),
          ),
        ),
        deleteMany: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: prisma }],
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

  it('sends high priority, so a locked Android phone shows it at once', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', status: 'ONLINE', statusUntil: null, language: 'uk' },
    ]);

    await service.sendToUsers(['u1'], { title: 't', body: 'b' });

    expect(sent[0]).toEqual(expect.objectContaining({ priority: 'high' }));
  });
});

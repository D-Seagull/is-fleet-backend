import { DocumentsService } from './documents.service';

// expo-server-sdk is ESM-only, pulled in transitively via the gateway import
// chain; every dependency here is a plain mock.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

// A voice message pushes the other chat participant, like a text message.
describe('DocumentsService — voice message push', () => {
  const manager = { id: 'mgr', role: 'MANAGER', companyId: 'c1' };
  const trip = {
    id: 't1',
    companyId: 'c1',
    driverId: 'drv',
    managerId: 'mgr',
    truckId: 'tr1',
  };
  let prisma: Record<string, Record<string, jest.Mock>>;
  let push: { sendLocalizedToUsers: jest.Mock };
  let service: DocumentsService;

  const stored = (fileType: 'AUDIO' | 'PHOTO') => ({
    id: 'doc1',
    tripId: 't1',
    uploadedBy: 'mgr',
    fileType,
    durationMs: 7000,
    caption: null,
    fileName: 'voice.m4a',
    uploader: { id: 'mgr', firstName: 'Olek', lastName: 'Test' },
    trip: {
      ...trip,
      truck: { id: 'tr1', plate: 'WX 123' },
    },
  });

  beforeEach(() => {
    prisma = {
      trip: { findFirst: jest.fn().mockResolvedValue(trip) },
      tripChatSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1' }),
      },
      tripDocument: { create: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'drv' }) },
    };
    push = { sendLocalizedToUsers: jest.fn().mockResolvedValue(undefined) };
    const storage = {
      uploadAttachment: jest
        .fn()
        .mockResolvedValue({ storagePath: 'documents/x.m4a', thumbPath: null }),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed'),
      getThumbUrl: jest.fn().mockResolvedValue(null),
    };
    const gateway = {
      emitNewDocument: jest.fn(),
      emitTripUnread: jest.fn(),
    };
    service = new DocumentsService(
      prisma as never,
      storage as never,
      gateway as never,
      {} as never,
      push as never,
    );
  });

  const voiceFile = {
    originalname: 'voice.m4a',
    mimetype: 'audio/mp4',
    buffer: Buffer.from('x'),
    size: 1,
  } as Express.Multer.File;

  async function upload(fileType: 'AUDIO' | 'PHOTO') {
    prisma.tripDocument.create.mockResolvedValue(stored(fileType));
    await service.uploadMany('t1', manager, [voiceFile], null, null, null, 7000);
    // the push runs after the response is built — let it settle
    await new Promise((r) => setImmediate(r));
  }

  it("pushes the trip's driver with the length when the manager sends a voice message", async () => {
    await upload('AUDIO');
    expect(push.sendLocalizedToUsers).toHaveBeenCalledTimes(1);
    const [recipients, build, extra] = push.sendLocalizedToUsers.mock.calls[0];
    expect(recipients).toEqual(['drv']);
    expect(build('uk').body).toBe('🎤 0:07');
    expect(extra).toMatchObject({
      channelId: 'chat',
      whenActive: 'skip',
      data: { type: 'MESSAGE', tripId: 't1', truckId: 'tr1', messageId: 'doc1' },
    });
  });

  it('does not push for other attachments (photos, files)', async () => {
    await upload('PHOTO');
    expect(push.sendLocalizedToUsers).not.toHaveBeenCalled();
  });

  it('does not push a driver who has moved to another company', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await upload('AUDIO');
    expect(push.sendLocalizedToUsers).not.toHaveBeenCalled();
  });
});

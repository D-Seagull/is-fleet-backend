import { TripChatSessionsService } from './trip-chat-sessions.service';

// Chats stay per driver: the trip's new driver reads only the sessions they
// were the driver of — never the previous driver's chat (P1-5).
describe('TripChatSessionsService.getVisibleSessionIds', () => {
  let prisma: {
    trip: { findFirst: jest.Mock };
    tripChatSession: { findMany: jest.Mock };
  };
  let service: TripChatSessionsService;

  beforeEach(() => {
    prisma = {
      trip: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ driverId: 'drvNew', managerId: 'm1' }),
      },
      tripChatSession: {
        findMany: jest.fn().mockResolvedValue([{ id: 's2' }]),
      },
    };
    service = new TripChatSessionsService(prisma as never);
  });

  it('the new driver sees only sessions where they were the driver', async () => {
    await service.getVisibleSessionIds('t1', { id: 'drvNew', role: 'DRIVER' });
    expect(prisma.tripChatSession.findMany).toHaveBeenCalledWith({
      where: { tripId: 't1', OR: [{ driverId: 'drvNew' }] },
      select: { id: true },
    });
  });

  it('a replaced driver gets nothing live (their chat is in the archive)', async () => {
    await expect(
      service.getVisibleSessionIds('t1', { id: 'drvOld', role: 'DRIVER' }),
    ).resolves.toEqual([]);
    expect(prisma.tripChatSession.findMany).not.toHaveBeenCalled();
  });
});

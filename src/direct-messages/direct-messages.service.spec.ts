import { DirectMessagesService } from './direct-messages.service';

// P1-5: the DM list a DRIVER gets carries no other driver's phone.
describe('DirectMessagesService.getConversations — driver view', () => {
  const peer = (role: string) => ({
    id: `p-${role}`,
    firstName: 'P',
    lastName: null,
    avatar: null,
    status: 'ONLINE',
    statusUntil: null,
    lastSeenAt: null,
    role,
    phone: '+48500111222',
    truckPlate: role === 'DRIVER' ? 'WX 1' : null,
  });
  let service: DirectMessagesService;

  beforeEach(() => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { user: peer('DRIVER'), last_message: {}, unread_count: 1 },
        { user: peer('MANAGER'), last_message: {}, unread_count: 0 },
      ]),
    };
    service = new DirectMessagesService(prisma as never, {} as never);
  });

  it('blanks another driver’s phone, keeps the truck plate and staff phones', async () => {
    const convs = await service.getConversations('me', 'DRIVER');
    expect(convs[0].user).toEqual(
      expect.objectContaining({
        role: 'DRIVER',
        phone: null,
        truckPlate: 'WX 1',
      }),
    );
    expect(convs[1].user.phone).toBe('+48500111222');
  });

  it('the unread summary (chat/init) gets the same view', async () => {
    const summary = await service.getUnreadSummary('me', 'DRIVER');
    expect(summary.items[0].user.phone).toBeNull();
  });

  it('managers are unaffected', async () => {
    const convs = await service.getConversations('me', 'MANAGER');
    expect(convs[0].user.phone).toBe('+48500111222');
  });
});

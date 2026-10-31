import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import { assertReplyTargets } from './reply-targets';

// Audit M1: a reply may quote only a message / file of its own conversation.

function mockPrisma() {
  const model = () => ({ findFirst: jest.fn().mockResolvedValue(null) });
  return {
    message: model(),
    tripDocument: model(),
    groupMessage: model(),
    groupMessageDocument: model(),
    directMessage: model(),
    directMessageDocument: model(),
  };
}
const asPrisma = (p: ReturnType<typeof mockPrisma>) =>
  p as unknown as PrismaService;

describe('assertReplyTargets', () => {
  it('passes when nothing is quoted (no DB call)', async () => {
    const prisma = mockPrisma();
    await assertReplyTargets(
      asPrisma(prisma),
      { trip: 't1' },
      {
        messageId: null,
        documentId: '',
      },
    );
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.tripDocument.findFirst).not.toHaveBeenCalled();
  });

  it('trip: looks the quote up inside the same trip; a foreign one is 404', async () => {
    const prisma = mockPrisma();
    await expect(
      assertReplyTargets(
        asPrisma(prisma),
        { trip: 't1' },
        { messageId: 'mOther' },
      ),
    ).rejects.toThrow(new NotFoundException('errors.messageNotFound'));
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'mOther', tripId: 't1' },
      select: { id: true },
    });
  });

  it('trip: a file of the same trip is fine', async () => {
    const prisma = mockPrisma();
    prisma.tripDocument.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(
      assertReplyTargets(
        asPrisma(prisma),
        { trip: 't1' },
        { documentId: 'd1' },
      ),
    ).resolves.toBeUndefined();
    expect(prisma.tripDocument.findFirst.mock.calls[0][0].where).toEqual({
      id: 'd1',
      tripId: 't1',
    });
  });

  it('group: scoped by groupId', async () => {
    const prisma = mockPrisma();
    await expect(
      assertReplyTargets(
        asPrisma(prisma),
        { group: 'g1' },
        { documentId: 'gd9' },
      ),
    ).rejects.toThrow('errors.documentNotFound');
    expect(
      prisma.groupMessageDocument.findFirst.mock.calls[0][0].where,
    ).toEqual({
      id: 'gd9',
      groupId: 'g1',
    });
  });

  it('DM: either direction of the same pair, nobody else', async () => {
    const prisma = mockPrisma();
    prisma.directMessage.findFirst.mockResolvedValue({ id: 'dm1' });
    await assertReplyTargets(
      asPrisma(prisma),
      { dm: ['a', 'b'] },
      { messageId: 'dm1' },
    );
    expect(prisma.directMessage.findFirst.mock.calls[0][0].where).toEqual({
      id: 'dm1',
      OR: [
        { senderId: 'a', receiverId: 'b' },
        { senderId: 'b', receiverId: 'a' },
      ],
    });
  });

  it('rejects a non-string id without querying (no Prisma filter injection)', async () => {
    const prisma = mockPrisma();
    await expect(
      assertReplyTargets(
        asPrisma(prisma),
        { trip: 't1' },
        { messageId: { not: '' } },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });
});

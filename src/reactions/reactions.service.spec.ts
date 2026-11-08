import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_EMOJI,
  BASE_EMOJI,
  EXTRA_EMOJI,
  ReactionsService,
} from './reactions.service';

describe('ReactionsService emoji whitelist', () => {
  it('has the 5 base reactions first, no duplicates anywhere', () => {
    expect([...BASE_EMOJI]).toEqual(['👍', '😂', '😮', '😢', '😡']);
    expect(new Set(ALLOWED_EMOJI).size).toBe(
      BASE_EMOJI.length + EXTRA_EMOJI.length,
    );
  });

  it('keeps the originally supported emojis valid (old clients)', () => {
    for (const e of ['👍', '😮', '😢']) {
      expect(ALLOWED_EMOJI).toContain(e);
    }
  });

  it('rejects an emoji outside the whitelist without touching the DB', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new ReactionsService(prisma as never);
    await expect(
      service.toggle('GROUP', 'm1', 'u1', 'not-an-emoji'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts an extended emoji (reaches the transaction)', async () => {
    const prisma = { $transaction: jest.fn().mockResolvedValue([]) };
    const service = new ReactionsService(prisma as never);
    await expect(service.toggle('GROUP', 'm1', 'u1', '💩')).resolves.toEqual([]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

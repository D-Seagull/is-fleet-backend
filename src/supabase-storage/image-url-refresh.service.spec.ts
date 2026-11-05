import { ImageUrlRefreshService } from './image-url-refresh.service';
import { signedUrlExpiry, STORED_IMAGE_TTL } from './supabase-storage.service';

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const DAY = 24 * 3600;

/** A Supabase-style signed URL whose token expires in `secondsLeft`. */
function signed(path: string, secondsLeft: number, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      url: `is-fleet/${path}`,
      exp: Math.floor(now / 1000) + secondsLeft,
    }),
  ).toString('base64url');
  return `https://x.supabase.co/storage/v1/object/sign/is-fleet/${path}?token=h.${payload}.s`;
}

describe('signedUrlExpiry', () => {
  it('reads exp from the token', () => {
    const now = Date.now();
    const exp = signedUrlExpiry(signed('avatars/a.jpg', 3600, now));
    expect(Math.abs(exp!.getTime() - (now + 3600_000))).toBeLessThan(1000);
  });
  it('null for anything without a readable token', () => {
    expect(signedUrlExpiry(null)).toBeNull();
    expect(signedUrlExpiry('https://x/y.jpg')).toBeNull();
    expect(signedUrlExpiry('not a url')).toBeNull();
  });
});

describe('ImageUrlRefreshService (P1-11)', () => {
  it.each([
    ['an old ~10-year link', 10 * 365 * DAY, true],
    ['a fresh 7-day link', STORED_IMAGE_TTL - 60, false],
    ['5 days left', 5 * DAY, false],
    ['1 day left', DAY, true],
    ['already expired', -60, true],
  ])('%s → re-sign: %s', (_label, left, expected) => {
    expect(
      ImageUrlRefreshService.needsResign(signed('avatars/a.jpg', left)),
    ).toBe(expected);
  });

  it('re-signs only what needs it, with the 7-day lifetime, and skips missing files', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'old',
            avatar: signed('avatars/old.jpg', 3650 * DAY),
            avatarPublicId: 'avatars/old.jpg',
          },
          {
            id: 'fresh',
            avatar: signed('avatars/fresh.jpg', 6 * DAY),
            avatarPublicId: 'avatars/fresh.jpg',
          },
          {
            id: 'gone',
            avatar: signed('avatars/gone.jpg', DAY),
            avatarPublicId: 'avatars/gone.jpg',
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      company: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'c1',
              logo: signed('logos/c1.png', 3650 * DAY),
              logoPublicId: 'logos/c1.png',
            },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      group: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    };
    const storage = {
      getSignedUrlOrNull: jest.fn((path: string) =>
        Promise.resolve(path.includes('gone') ? null : `https://new/${path}`),
      ),
    };
    const service = new ImageUrlRefreshService(
      prisma as never,
      storage as never,
    );

    await expect(service.refreshAll()).resolves.toEqual({
      users: 1,
      companies: 1,
      groups: 0,
    });
    expect(storage.getSignedUrlOrNull).toHaveBeenCalledWith(
      'avatars/old.jpg',
      STORED_IMAGE_TTL,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: { avatar: 'https://new/avatars/old.jpg' },
    });
    // The fresh one is left alone; the missing file isn't blanked out.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { logo: 'https://new/logos/c1.png' },
    });
  });
});

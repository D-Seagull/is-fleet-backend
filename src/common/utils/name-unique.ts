import { ConflictException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';

/** "  Іван   ПЕТРЕНКО " and "іван петренко" are the same person. */
export const normalizePersonName = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) =>
  `${firstName ?? ''} ${lastName ?? ''}`
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

/**
 * One first + last name per company, across every role — a second
 * "Іван Петренко" is refused, whether the first one is a driver or a manager.
 * Deactivated users count (the answer says so, so the creator can activate
 * them instead); erased accounts and the system contact don't. A company has
 * few enough people to compare in memory.
 */
export async function assertNameFree(
  prisma: Pick<PrismaService, 'user'>,
  companyId: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  excludeUserId?: string,
) {
  const wanted = normalizePersonName(firstName, lastName);
  if (!wanted) return;
  const users = await prisma.user.findMany({
    where: {
      companyId,
      deletedAt: null,
      isSystem: false,
      ...(excludeUserId && { id: { not: excludeUserId } }),
    },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });
  const existing = users.find(
    (u) => normalizePersonName(u.firstName, u.lastName) === wanted,
  );
  if (existing) {
    throw new ConflictException(
      existing.isActive
        ? 'errors.userNameExists'
        : 'errors.userNameExistsInactive',
    );
  }
}

import { PrismaService } from 'src/prisma/prisma.service';

/**
 * True when this user's writes should be blocked because their company has
 * been deactivated. Mirrors JwtGuard's HTTP-side check — used by the socket
 * gateways, which authenticate manually and don't go through JwtGuard.
 */
export async function isCompanyWriteBlocked(
  prisma: PrismaService,
  userId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, company: { select: { isActive: true } } },
  });
  if (!user || user.role === 'ADMIN') return false;
  return user.company.isActive === false;
}

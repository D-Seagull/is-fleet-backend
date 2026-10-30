import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { PrismaService } from 'src/prisma/prisma.service';

export interface SocketUser {
  userId: string;
  role: string;
  companyId: string;
}

// One lookup per socket, shared by every gateway on the server (each one's
// handleConnection runs for the same socket). Kept off `client.data` so a
// future Redis adapter doesn't try to serialise a Promise.
const authBySocket = new WeakMap<Socket, Promise<SocketUser | null>>();

/**
 * Authenticate a socket handshake: verify the JWT, then re-read role, company
 * and isActive from the DB (same as JwtStrategy on HTTP — the token's claims
 * may be stale and a deactivated user must not keep a live socket). On
 * success `client.data.userId/role/companyId` are set from the DB row.
 *
 * Call it synchronously at the top of handleConnection: the promise is cached
 * before the first await, so message handlers that run while the lookup is in
 * flight can `await socketUser(client)` instead of seeing no user.
 */
export function authenticateSocket(
  client: Socket,
  jwt: JwtService,
  prisma: PrismaService,
): Promise<SocketUser | null> {
  let pending = authBySocket.get(client);
  if (!pending) {
    pending = resolveSocketUser(client, jwt, prisma);
    authBySocket.set(client, pending);
  }
  return pending;
}

/** The authenticated user of this socket, or null (never connected / rejected). */
export function socketUser(client: Socket): Promise<SocketUser | null> {
  return authBySocket.get(client) ?? Promise.resolve(null);
}

async function resolveSocketUser(
  client: Socket,
  jwt: JwtService,
  prisma: PrismaService,
): Promise<SocketUser | null> {
  // web: auth.token; older mobile builds: query.userId (a JWT despite the name).
  const token =
    (client.handshake.auth?.token as unknown) ||
    (client.handshake.query?.userId as unknown);
  if (typeof token !== 'string' || !token) return null;

  let sub: unknown;
  try {
    sub = jwt.verify<{ sub?: unknown }>(token, {
      secret: process.env.JWT_SECRET,
    }).sub;
  } catch {
    return null;
  }
  if (typeof sub !== 'string') return null;

  const user = await prisma.user
    .findUnique({
      where: { id: sub },
      select: {
        id: true,
        role: true,
        companyId: true,
        isActive: true,
        deletedAt: true,
      },
    })
    .catch(() => null);
  if (!user || !user.isActive || user.deletedAt) return null;

  client.data.userId = user.id;
  client.data.role = user.role;
  client.data.companyId = user.companyId;
  return { userId: user.id, role: user.role, companyId: user.companyId };
}

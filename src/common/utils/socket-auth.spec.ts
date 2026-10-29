import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { PrismaService } from 'src/prisma/prisma.service';
import { authenticateSocket, socketUser } from './socket-auth';
import { maskPhone } from './phone';

const fakeSocket = (auth: Record<string, unknown> = {}) =>
  ({ handshake: { auth, query: {} }, data: {} }) as unknown as Socket;

describe('authenticateSocket', () => {
  const jwt = {
    verify: jest.fn((token: string) => {
      if (token !== 'good') throw new Error('bad signature');
      return { sub: 'u1' };
    }),
  } as unknown as JwtService;
  let findUnique: jest.Mock;
  let prisma: PrismaService;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue({
      id: 'u1',
      role: 'MANAGER',
      companyId: 'cA',
      isActive: true,
      deletedAt: null,
    });
    prisma = { user: { findUnique } } as unknown as PrismaService;
  });

  it('rejects a handshake without a token', async () => {
    await expect(
      authenticateSocket(fakeSocket(), jwt, prisma),
    ).resolves.toBeNull();
  });

  it('rejects an invalid token', async () => {
    await expect(
      authenticateSocket(fakeSocket({ token: 'forged' }), jwt, prisma),
    ).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a deactivated or deleted user even with a valid token', async () => {
    findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'DRIVER',
      companyId: 'cA',
      isActive: false,
      deletedAt: null,
    });
    await expect(
      authenticateSocket(fakeSocket({ token: 'good' }), jwt, prisma),
    ).resolves.toBeNull();
    findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'DRIVER',
      companyId: 'cA',
      isActive: true,
      deletedAt: new Date(),
    });
    await expect(
      authenticateSocket(fakeSocket({ token: 'good' }), jwt, prisma),
    ).resolves.toBeNull();
  });

  it('takes role and company from the DB and shares one lookup per socket', async () => {
    const s = fakeSocket({ token: 'good' });
    const first = authenticateSocket(s, jwt, prisma);
    const second = authenticateSocket(s, jwt, prisma);
    expect(second).toBe(first);
    await expect(socketUser(s)).resolves.toEqual({
      userId: 'u1',
      role: 'MANAGER',
      companyId: 'cA',
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(s.data).toEqual(
      expect.objectContaining({
        userId: 'u1',
        role: 'MANAGER',
        companyId: 'cA',
      }),
    );
  });

  it('socketUser is null for a socket that never authenticated', async () => {
    await expect(socketUser(fakeSocket())).resolves.toBeNull();
  });
});

describe('maskPhone', () => {
  it('keeps only the last three digits', () => {
    expect(maskPhone('+48 600 123 456')).toBe('***456');
    expect(maskPhone(undefined)).toBe('INVALID');
  });
});

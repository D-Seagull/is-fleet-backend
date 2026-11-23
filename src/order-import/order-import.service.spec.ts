import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { OrderImportService } from './order-import.service';

/** A service with the server switch on/off and a company AI flag. */
function make(serverOn: boolean, companyAi: boolean | null) {
  const env: Record<string, string> = serverOn
    ? { ORDER_IMPORT_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key' }
    : {};
  const config = {
    get: (k: string) => env[k],
  } as unknown as ConfigService;
  const findUnique = jest.fn().mockResolvedValue(
    companyAi === null
      ? { company: null } // e.g. a user without a company
      : { company: { aiEnabled: companyAi } },
  );
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  return { service: new OrderImportService(config, prisma), findUnique };
}

const ctx = { userId: 'u1', companyId: 'c1' };
const text = { kind: 'text' as const, text: 'Loading: Berlin' };

describe('OrderImportService switches', () => {
  it('is on only when both the server and the company switch are on', async () => {
    expect(await make(true, true).service.enabledFor('u1')).toBe(true);
    expect(await make(true, false).service.enabledFor('u1')).toBe(false);
    expect(await make(false, true).service.enabledFor('u1')).toBe(false);
    expect(await make(true, null).service.enabledFor('u1')).toBe(false);
  });

  it('looks the company up by user id (ADMIN has no companyId on the request)', async () => {
    const { service, findUnique } = make(true, true);
    await service.enabledFor('admin-1');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin-1' } }),
    );
  });

  it('parse: 503 when the server switch is off', async () => {
    await expect(
      make(false, true).service.parse(text, ctx),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('parse: 403 when the company has AI off — before any model call', async () => {
    await expect(
      make(true, false).service.parse(text, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

import { NotFoundException } from '@nestjs/common';
import {
  assertCanMessageUser,
  assertCompanyTruck,
  assertCompanyUser,
  assertGroupAccess,
  assertTripAccess,
  assertTruckInCompany,
  assertUserInCompany,
  canAccessGroup,
} from './access';
import type { PrismaService } from 'src/prisma/prisma.service';

// Tenant-isolation regression tests: every helper must refuse another
// company's record with a 404 and let ADMIN through.

const A = { id: 'mgrA', role: 'MANAGER', companyId: 'cA' };
const tripA = {
  id: 't1',
  companyId: 'cA',
  driverId: 'drvA',
  managerId: 'mgrA',
  truckId: 'trA',
};

function mockPrisma() {
  return {
    trip: { findFirst: jest.fn() },
    tripChatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    group: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    truck: { findFirst: jest.fn() },
  };
}
const asPrisma = (p: ReturnType<typeof mockPrisma>) =>
  p as unknown as PrismaService;

describe('assertTripAccess', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
    prisma.trip.findFirst.mockResolvedValue(tripA);
  });

  it('lets a manager of the same company in', async () => {
    await expect(assertTripAccess(asPrisma(prisma), 't1', A)).resolves.toEqual(
      tripA,
    );
  });

  it('404s a manager of another company', async () => {
    await expect(
      assertTripAccess(asPrisma(prisma), 't1', { ...A, companyId: 'cB' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets ADMIN (companyId nulled by AdminInterceptor) into any company', async () => {
    await expect(
      assertTripAccess(asPrisma(prisma), 't1', {
        id: 'adm',
        role: 'ADMIN',
        companyId: null,
      }),
    ).resolves.toEqual(tripA);
  });

  it('lets a driver into their own trip only', async () => {
    await expect(
      assertTripAccess(asPrisma(prisma), 't1', {
        id: 'drvA',
        role: 'DRIVER',
        companyId: 'cA',
      }),
    ).resolves.toEqual(tripA);
    await expect(
      assertTripAccess(asPrisma(prisma), 't1', {
        id: 'drvOther',
        role: 'DRIVER',
        companyId: 'cA',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps a reassigned driver in their earlier session', async () => {
    prisma.tripChatSession.findFirst.mockResolvedValue({ id: 's0' });
    await expect(
      assertTripAccess(asPrisma(prisma), 't1', {
        id: 'drvOld',
        role: 'DRIVER',
        companyId: 'cA',
      }),
    ).resolves.toEqual(tripA);
  });

  it('never queries with a non-string id (no Prisma filter injection)', async () => {
    await expect(
      assertTripAccess(asPrisma(prisma), { not: '' }, A),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trip.findFirst).not.toHaveBeenCalled();
  });

  it('skips soft-deleted trips unless asked', async () => {
    await assertTripAccess(asPrisma(prisma), 't1', A);
    expect(prisma.trip.findFirst.mock.calls[0][0].where).toEqual({
      id: 't1',
      deletedAt: null,
    });
    await assertTripAccess(asPrisma(prisma), 't1', A, { includeDeleted: true });
    expect(prisma.trip.findFirst.mock.calls[1][0].where).toEqual({ id: 't1' });
  });
});

describe('canAccessGroup / assertGroupAccess', () => {
  const managersGroup = {
    id: 'g1',
    companyId: 'cA',
    type: 'MANAGERS',
    createdBy: 'creator',
    managers: [{ managerId: 'member' }],
  };
  const driversGroup = {
    ...managersGroup,
    id: 'g2',
    type: 'DRIVERS',
    managers: [],
  };

  it('never lets another company in', () => {
    for (const role of ['DRIVER', 'MANAGER', 'TEAMLEAD']) {
      expect(
        canAccessGroup(driversGroup, { id: 'x', role, companyId: 'cB' }),
      ).toBe(false);
    }
  });

  it('DRIVERS group: everyone of the company', () => {
    expect(
      canAccessGroup(driversGroup, {
        id: 'd',
        role: 'DRIVER',
        companyId: 'cA',
      }),
    ).toBe(true);
    expect(
      canAccessGroup(driversGroup, {
        id: 'm',
        role: 'MANAGER',
        companyId: 'cA',
      }),
    ).toBe(true);
  });

  it('MANAGERS group: no drivers, managers only as creator/member, teamleads all', () => {
    expect(
      canAccessGroup(managersGroup, {
        id: 'd',
        role: 'DRIVER',
        companyId: 'cA',
      }),
    ).toBe(false);
    expect(
      canAccessGroup(managersGroup, {
        id: 'member',
        role: 'MANAGER',
        companyId: 'cA',
      }),
    ).toBe(true);
    expect(
      canAccessGroup(managersGroup, {
        id: 'creator',
        role: 'MANAGER',
        companyId: 'cA',
      }),
    ).toBe(true);
    expect(
      canAccessGroup(managersGroup, {
        id: 'outsider',
        role: 'MANAGER',
        companyId: 'cA',
      }),
    ).toBe(false);
    expect(
      canAccessGroup(managersGroup, {
        id: 'tl',
        role: 'TEAMLEAD',
        companyId: 'cA',
      }),
    ).toBe(true);
  });

  it('ADMIN sees any group', () => {
    expect(
      canAccessGroup(managersGroup, {
        id: 'a',
        role: 'ADMIN',
        companyId: null,
      }),
    ).toBe(true);
  });

  it('assertGroupAccess 404s a foreign group and deleted groups are not loaded', async () => {
    const prisma = mockPrisma();
    prisma.group.findFirst.mockResolvedValue(managersGroup);
    await expect(
      assertGroupAccess(asPrisma(prisma), 'g1', {
        id: 'tl',
        role: 'TEAMLEAD',
        companyId: 'cB',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.group.findFirst.mock.calls[0][0].where).toEqual({
      id: 'g1',
      deletedAt: null,
    });
  });
});

describe('user / truck references', () => {
  it('assertCompanyUser refuses a user of another company', async () => {
    const prisma = mockPrisma();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u',
      role: 'DRIVER',
      companyId: 'cB',
    });
    await expect(
      assertCompanyUser(asPrisma(prisma), 'u', A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertCompanyTruck refuses a truck of another company', async () => {
    const prisma = mockPrisma();
    prisma.truck.findFirst.mockResolvedValue({ id: 'tr', companyId: 'cB' });
    await expect(
      assertCompanyTruck(asPrisma(prisma), 'tr', A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertUserInCompany scopes the lookup by company and role', async () => {
    const prisma = mockPrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      assertUserInCompany(
        asPrisma(prisma),
        'drvB',
        'cA',
        ['DRIVER'],
        'errors.driverNotFound',
      ),
    ).rejects.toThrow('errors.driverNotFound');
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        id: 'drvB',
        companyId: 'cA',
        role: { in: ['DRIVER'] },
      }),
    );
  });

  it('assertTruckInCompany scopes the lookup by company', async () => {
    const prisma = mockPrisma();
    prisma.truck.findFirst.mockResolvedValue(null);
    await expect(
      assertTruckInCompany(asPrisma(prisma), 'trB', 'cA'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.truck.findFirst.mock.calls[0][0].where).toEqual({
      id: 'trB',
      companyId: 'cA',
    });
  });

  it('assertCanMessageUser: same company or an ADMIN on either side', async () => {
    const prisma = mockPrisma();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u',
      role: 'DRIVER',
      companyId: 'cB',
    });
    await expect(
      assertCanMessageUser(asPrisma(prisma), 'u', A),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.user.findFirst.mockResolvedValue({
      id: 'adm',
      role: 'ADMIN',
      companyId: 'cX',
    });
    await expect(
      assertCanMessageUser(asPrisma(prisma), 'adm', A),
    ).resolves.toBeTruthy();
  });
});

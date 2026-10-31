import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Tenant-isolation checks shared by HTTP services and socket gateways.
 *
 * Every "act on a record by id" path loads the record's company (directly or
 * through its trip / group) and compares it with the caller's. A miss is a
 * 404 with the record's usual not-found key — never a 403, so the endpoint
 * can't be used to probe whether an id exists in another company.
 *
 * `companyId` is null for ADMIN on HTTP (AdminInterceptor) — ADMIN is the
 * platform superuser and bypasses the company comparison everywhere.
 */
export interface Requester {
  id: string;
  role: string;
  companyId?: string | null;
}

/** Plain-string id guard — a JSON body can smuggle `{ not: '' }` filters. */
function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64;
}

function sameCompany(companyId: string | null, requester: Requester) {
  return (
    requester.role === 'ADMIN' ||
    (!!companyId && companyId === requester.companyId)
  );
}

// ─── Trips ──────────────────────────────────────────────────────────────────

export type TripAccessRow = {
  id: string;
  companyId: string;
  driverId: string | null;
  managerId: string | null;
  truckId: string | null;
};

/**
 * May `requester` see this trip's chat / documents?
 *  - ADMIN → any trip.
 *  - TEAMLEAD / MANAGER → any trip of their company.
 *  - DRIVER → a trip of their company they drive now, or drove in an earlier
 *    chat session (their own history survives a reassignment).
 */
export async function canAccessTrip(
  prisma: PrismaService,
  trip: TripAccessRow,
  requester: Requester,
): Promise<boolean> {
  if (requester.role === 'ADMIN') return true;
  if (trip.companyId !== requester.companyId) return false;
  if (requester.role !== 'DRIVER') return true;
  if (trip.driverId === requester.id) return true;
  const past = await prisma.tripChatSession.findFirst({
    where: { tripId: trip.id, driverId: requester.id },
    select: { id: true },
  });
  return !!past;
}

export async function assertTripAccess(
  prisma: PrismaService,
  tripId: unknown,
  requester: Requester,
  opts: { includeDeleted?: boolean } = {},
): Promise<TripAccessRow> {
  const trip = isId(tripId)
    ? await prisma.trip.findFirst({
        where: {
          id: tripId,
          ...(opts.includeDeleted ? {} : { deletedAt: null }),
        },
        select: {
          id: true,
          companyId: true,
          driverId: true,
          managerId: true,
          truckId: true,
        },
      })
    : null;
  if (!trip || !(await canAccessTrip(prisma, trip, requester))) {
    throw new NotFoundException('errors.tripNotFound');
  }
  return trip;
}

// ─── Groups ─────────────────────────────────────────────────────────────────

export type GroupAccessRow = {
  id: string;
  companyId: string;
  type: string;
  createdBy: string;
  managers: { managerId: string }[];
};

const GROUP_ACCESS_SELECT = {
  id: true,
  companyId: true,
  type: true,
  createdBy: true,
  managers: { select: { managerId: true } },
} as const;

/**
 * May `requester` read / post in this group? Mirrors what the group lists
 * show each role:
 *  - ADMIN → any group.
 *  - other company → never.
 *  - DRIVERS (company "All Drivers") → everyone in the company.
 *  - MANAGERS / TRUCKS → never a DRIVER; a MANAGER only in MANAGERS groups
 *    they created or belong to (findAllManagersGroups); TEAMLEAD → all.
 */
export function canAccessGroup(
  group: GroupAccessRow,
  requester: Requester,
): boolean {
  if (requester.role === 'ADMIN') return true;
  if (group.companyId !== requester.companyId) return false;
  if (group.type === 'DRIVERS') return true;
  if (requester.role === 'DRIVER') return false;
  if (requester.role === 'MANAGER' && group.type === 'MANAGERS') {
    return (
      group.createdBy === requester.id ||
      group.managers.some((m) => m.managerId === requester.id)
    );
  }
  return true;
}

export async function assertGroupAccess(
  prisma: PrismaService,
  groupId: unknown,
  requester: Requester,
): Promise<GroupAccessRow> {
  const group = isId(groupId)
    ? await prisma.group.findFirst({
        where: { id: groupId, deletedAt: null },
        select: GROUP_ACCESS_SELECT,
      })
    : null;
  if (!group || !canAccessGroup(group, requester)) {
    throw new NotFoundException('errors.groupNotFound');
  }
  return group;
}

/** Same as assertGroupAccess but returns false instead of throwing. */
export async function hasGroupAccess(
  prisma: PrismaService,
  groupId: unknown,
  requester: Requester,
): Promise<boolean> {
  try {
    await assertGroupAccess(prisma, groupId, requester);
    return true;
  } catch {
    return false;
  }
}

// ─── Users / trucks referenced by id ───────────────────────────────────────

/**
 * A user of the requester's company (ADMIN: any), optionally limited to
 * `roles`. Used for foreign ids in request bodies (driverId, managerId, …)
 * so a manager can't attach another company's people to their records.
 */
export async function assertCompanyUser(
  prisma: PrismaService,
  userId: unknown,
  requester: Requester,
  opts: { roles?: string[]; notFound?: string } = {},
): Promise<{ id: string; role: string; companyId: string }> {
  const user = isId(userId)
    ? await prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
          ...(opts.roles ? { role: { in: opts.roles as never } } : {}),
        },
        select: { id: true, role: true, companyId: true },
      })
    : null;
  if (!user || !sameCompany(user.companyId, requester)) {
    throw new NotFoundException(opts.notFound ?? 'errors.userNotFound');
  }
  return user;
}

/** A truck of the requester's company (ADMIN: any). */
export async function assertCompanyTruck(
  prisma: PrismaService,
  truckId: unknown,
  requester: Requester,
): Promise<{ id: string; companyId: string }> {
  const truck = isId(truckId)
    ? await prisma.truck.findFirst({
        where: { id: truckId },
        select: { id: true, companyId: true },
      })
    : null;
  if (!truck || !sameCompany(truck.companyId, requester)) {
    throw new NotFoundException('errors.truckNotFound');
  }
  return truck;
}

/**
 * May `requester` start / continue a DM (or send a DM file) with `otherUserId`?
 * Same company, or either side is a platform ADMIN (support chats cross
 * companies by design).
 */
export async function assertCanMessageUser(
  prisma: PrismaService,
  otherUserId: unknown,
  requester: Requester,
): Promise<{ id: string; role: string; companyId: string }> {
  const other = isId(otherUserId)
    ? await prisma.user.findFirst({
        where: { id: otherUserId, deletedAt: null },
        select: { id: true, role: true, companyId: true },
      })
    : null;
  if (
    !other ||
    !(other.role === 'ADMIN' || sameCompany(other.companyId, requester))
  ) {
    throw new NotFoundException('errors.userNotFound');
  }
  return other;
}

// ─── Foreign ids in request bodies, scoped to a known company ─────────────

/**
 * `userId` (from a request body) is a user of `companyId` with one of
 * `roles`. For records that already carry their company (a trip, a truck,
 * the user being edited) — the referenced person must come from the same one.
 */
export async function assertUserInCompany(
  prisma: PrismaService,
  userId: unknown,
  companyId: string,
  roles: string[],
  notFound = 'errors.userNotFound',
): Promise<void> {
  const user = isId(userId)
    ? await prisma.user.findFirst({
        where: {
          id: userId,
          companyId,
          deletedAt: null,
          role: { in: roles as never },
        },
        select: { id: true },
      })
    : null;
  if (!user) throw new NotFoundException(notFound);
}

/** `truckId` (from a request body) is a truck of `companyId`. */
export async function assertTruckInCompany(
  prisma: PrismaService,
  truckId: unknown,
  companyId: string,
): Promise<void> {
  const truck = isId(truckId)
    ? await prisma.truck.findFirst({
        where: { id: truckId, companyId },
        select: { id: true },
      })
    : null;
  if (!truck) throw new NotFoundException('errors.truckNotFound');
}

export const MANAGER_ROLES = ['ADMIN', 'TEAMLEAD', 'MANAGER'];

/**
 * Is `truckId` the truck this driver is assigned to right now? A driver's
 * truck-wide views (all documents of the truck, truck notes) follow the
 * truck, not the trip: the current driver also sees what was uploaded on
 * the previous driver's trips, and nothing of other trucks (P1-5).
 */
export async function isDriversCurrentTruck(
  prisma: PrismaService,
  truckId: unknown,
  driverId: string,
): Promise<boolean> {
  if (!isId(truckId)) return false;
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, currentDriverId: driverId },
    select: { id: true },
  });
  return !!truck;
}

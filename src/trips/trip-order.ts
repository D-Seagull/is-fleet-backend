/**
 * Which of several open trips is the one the driver is doing *now*.
 *
 * A manager may queue the next load while the current one is still running,
 * so "newest open trip" is wrong: it would put a freshly ASSIGNED order in
 * front of the one already on the road. Rule, shared by every client:
 *   1. furthest along wins (LOADED > ON_SITE > ON_WAY > ACCEPTED > ASSIGNED);
 *   2. same status → the OLDEST first (loads are done in the order given).
 * Every other open trip is "queued" — hidden from chat until it's current.
 */
export const OPEN_TRIP_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'ON_WAY',
  'ON_SITE',
  'LOADED',
] as const;

const PROGRESS_RANK: Record<string, number> = {
  LOADED: 5,
  ON_SITE: 4,
  ON_WAY: 3,
  ACCEPTED: 2,
  ASSIGNED: 1,
};

export function sortByProgress<T extends { status: string; createdAt: Date }>(
  trips: T[],
): T[] {
  return [...trips].sort((a, b) => {
    const byStatus =
      (PROGRESS_RANK[b.status] ?? 0) - (PROGRESS_RANK[a.status] ?? 0);
    if (byStatus !== 0) return byStatus;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Keep only a truck's current trip in its `trips` list (0 or 1 element). */
export function withCurrentTripOnly<
  T extends { trips?: { status: string; createdAt: Date }[] },
>(truck: T): T {
  if (!truck.trips) return truck;
  return { ...truck, trips: sortByProgress(truck.trips).slice(0, 1) };
}

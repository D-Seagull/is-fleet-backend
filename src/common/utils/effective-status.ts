import { UserStatus } from '@prisma/client';

/**
 * Resolves the user's stored status against the wall clock — if a SLEEP
 * or BUSY timer has already passed, the user is back to ONLINE for the
 * purposes of display and push gating. Pure function; callers decide
 * what to do with the result (don't touch the DB just to render).
 */
export function effectiveStatus(user: {
  status: UserStatus;
  statusUntil: Date | null;
}): UserStatus {
  if (user.status === 'ONLINE') return 'ONLINE';
  if (user.statusUntil && user.statusUntil.getTime() <= Date.now()) {
    return 'ONLINE';
  }
  return user.status;
}

/** Convenience: should we silence push for this user right now? */
export function shouldSuppressPush(user: {
  status: UserStatus;
  statusUntil: Date | null;
}): boolean {
  const eff = effectiveStatus(user);
  return eff === 'BUSY' || eff === 'SLEEP';
}

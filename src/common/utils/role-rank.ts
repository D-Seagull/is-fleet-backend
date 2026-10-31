/**
 * Role hierarchy for managing other users (edit, deactivate, reactivate):
 * DRIVER < MANAGER < TEAMLEAD < ADMIN.
 *
 * - You manage only users ranked below you.
 * - ADMIN accounts are managed only by another ADMIN.
 * - Never yourself through these routes — your own profile goes through
 *   PATCH /users/me, which can't touch role, company or manager.
 *
 * The web and is-manager clients mirror this to hide actions that would
 * be refused (lib/roles.ts there) — keep them in step.
 */
const ROLE_RANK: Record<string, number> = {
  DRIVER: 0,
  MANAGER: 1,
  TEAMLEAD: 2,
  ADMIN: 3,
};

export function canManageUser(
  requester: { id: string; role: string },
  target: { id: string; role: string },
): boolean {
  if (requester.id === target.id) return false;
  if (target.role === 'ADMIN') return requester.role === 'ADMIN';
  const mine = ROLE_RANK[requester.role];
  const theirs = ROLE_RANK[target.role];
  if (mine === undefined || theirs === undefined) return false;
  return mine > theirs;
}

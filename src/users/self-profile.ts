import { Prisma } from '@prisma/client';

/**
 * Scalar fields of the signed-in user's own profile. Also the payload of the
 * `profileUpdated` socket event (see UsersService.emitProfileUpdated) — scalars
 * only, so an edit never ships a half-selected relation over the socket.
 */
export const SELF_PROFILE_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  language: true,
  uiLocale: true,
  timezone: true,
  status: true,
  statusUntil: true,
  lastSeenAt: true,
  companyId: true,
} satisfies Prisma.UserSelect;

export type ProfileField = keyof typeof SELF_PROFILE_FIELDS;

/**
 * The signed-in user's own profile — ONE shape for every response that hands
 * a client "me": /auth/me, login / OTP / refresh / register, and every
 * self-edit (profile, status, avatar). Clients keep it as their `user`.
 *
 * When these differed (token refresh returned a bare id / role / name), the
 * mobile apps replaced the stored profile with the bare one on every refresh
 * and the driver's avatar, status and truck vanished until a restart
 * (2026-10-17). Add a field here and every response carries it.
 */
export const SELF_PROFILE_SELECT = {
  ...SELF_PROFILE_FIELDS,
  company: { select: { isActive: true } },
  // For driver routing: which truck am I on, who is my manager.
  // Null for non-drivers — safe to expose either way.
  currentTruck: {
    select: {
      id: true,
      plate: true,
      status: true,
    },
  },
  manager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatar: true,
      status: true,
      statusUntil: true,
      lastSeenAt: true,
    },
  },
} satisfies Prisma.UserSelect;

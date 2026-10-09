import { JwtService } from '@nestjs/jwt';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limiting, keyed so that many devices behind ONE public IP — a ship's
 * Wi-Fi, a depot, a mobile carrier's NAT — don't throttle each other.
 *
 *  - `default` (300/min): per signed-in USER (verified JWT), so a driver's
 *    budget is their own no matter how many others share the address.
 *    Requests without a valid token fall back to the IP.
 *  - `ip` (3000/min): per address, on every route — the flood backstop,
 *    sized for a full ship of drivers behind one NAT.
 *  - auth routes (login / OTP / password reset) tighten both per route:
 *    `default` keyed by the phone / email being tried (brute force and SMS
 *    cost are per target), `ip` lowered so one address can't pump SMS to
 *    many numbers. See `authThrottle` in auth.controller.ts.
 *
 * Env overrides exist for load tests that measure raw capacity.
 */

const MINUTE = 60_000;

/**
 * The client's address. Correct only with `trust proxy` set (main.ts):
 * behind Render's proxy req.ip is otherwise the proxy itself, which would
 * put every user in the world into one bucket.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

const jwt = new JwtService();

/**
 * `user:<id>` for a request carrying a valid access token, else `ip:<addr>`.
 * The token is verified, not just decoded — a forged `sub` per request would
 * otherwise mint a fresh bucket every time. HS256 verify is microseconds.
 */
export async function userOrIp(req: Request): Promise<string> {
  const header = req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    try {
      const { sub } = await jwt.verifyAsync<{ sub?: string }>(header.slice(7), {
        secret: process.env.JWT_SECRET,
      });
      if (sub) return `user:${sub}`;
    } catch {
      // expired / invalid → counted against the address
    }
  }
  return `ip:${clientIp(req)}`;
}

/**
 * Keys by a body field (phone / email / reset token): the limit then guards
 * that one account however many people share the IP. Phones keep digits
 * only and emails are lower-cased, so "+380 97…" and "38097…" are one key.
 * Without the field (malformed body) falls back to the IP.
 */
export function byBodyField(field: 'phone' | 'email' | 'token') {
  return (req: Request): string => {
    const raw: unknown = (req.body as Record<string, unknown> | undefined)?.[
      field
    ];
    if (typeof raw !== 'string' || !raw.trim()) return `ip:${clientIp(req)}`;
    const value =
      field === 'phone'
        ? raw.replace(/\D/g, '')
        : field === 'email'
          ? raw.trim().toLowerCase()
          : raw.trim();
    return `${field}:${value}`;
  };
}

export const THROTTLERS: ThrottlerOptions[] = [
  {
    name: 'default',
    ttl: Number(process.env.THROTTLE_TTL_MS ?? MINUTE),
    limit: Number(process.env.THROTTLE_LIMIT ?? 300),
    getTracker: userOrIp,
  },
  {
    name: 'ip',
    ttl: MINUTE,
    limit: Number(process.env.THROTTLE_IP_LIMIT ?? 3000),
    getTracker: clientIp,
  },
];

/**
 * Per-route limits for the auth endpoints: `perTarget` per phone / email /
 * token, `perIp` per address.
 */
export function authThrottle(
  field: 'phone' | 'email' | 'token',
  perTarget: number,
  perIp: number,
) {
  return {
    default: { limit: perTarget, ttl: MINUTE, getTracker: byBodyField(field) },
    ip: { limit: perIp, ttl: MINUTE },
  };
}

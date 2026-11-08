import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { verifyTotp } from './totp';

/**
 * Helpers for the ADMIN two-factor code. The secret is stored AES-256-GCM
 * encrypted (key = TOTP_ENC_KEY, else derived from JWT_SECRET), recovery codes
 * as keyed hashes — a database read alone doesn't give a second factor.
 */

export function totpKey(env: { TOTP_ENC_KEY?: string; JWT_SECRET?: string }) {
  return crypto
    .createHash('sha256')
    .update(env.TOTP_ENC_KEY || env.JWT_SECRET || '')
    .digest();
}

export function sealSecret(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function openSecret(sealed: string, key: Buffer): string {
  const [iv, tag, enc] = sealed.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export function hashRecoveryCode(code: string, key: Buffer): string {
  return crypto
    .createHmac('sha256', key)
    .update(code.replace(/[\s-]/g, '').toUpperCase())
    .digest('hex');
}

/** 10 codes like "K7QM-2XPD" — shown once, stored hashed. */
export function newRecoveryCodes(): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => {
    const pick = () =>
      Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join('');
    return `${pick()}-${pick()}`;
  });
}

export interface TotpUserRow {
  id: string;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpRecoveryCodes: string[];
}

/**
 * Second step of an ADMIN sign-in. No-op when the user has no 2FA on. Throws
 * `errors.totpRequired` when a code is needed and absent, `errors.totpInvalid`
 * when wrong. A recovery code works once (consumed via `consume`).
 */
export async function assertTotpOk(
  user: TotpUserRow,
  code: string | undefined,
  key: Buffer,
  consume: (userId: string, remaining: string[]) => Promise<void>,
): Promise<void> {
  if (!user.totpEnabledAt || !user.totpSecret) return;
  if (!code) throw new UnauthorizedException({
      message: 'errors.totpRequired',
      code: 'TOTP_REQUIRED',
    });
  if (verifyTotp(openSecret(user.totpSecret, key), code)) return;
  const hashed = hashRecoveryCode(code, key);
  if (user.totpRecoveryCodes.includes(hashed)) {
    await consume(
      user.id,
      user.totpRecoveryCodes.filter((h) => h !== hashed),
    );
    return;
  }
  throw new UnauthorizedException('errors.totpInvalid');
}

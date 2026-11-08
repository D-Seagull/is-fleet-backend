import * as crypto from 'crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what Google Authenticator, 1Password,
 * Authy etc. speak. Kept in-house: ~40 lines, and no dependency to audit.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_S = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_S);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(
  secret: string,
  code: string,
  atMs: number = Date.now(),
): boolean {
  const given = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  let ok = false;
  for (const drift of [-1, 0, 1]) {
    const expected = totpCode(secret, atMs + drift * STEP_S * 1000);
    // no early exit: constant work whichever step matches
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      ok = true;
    }
  }
  return ok;
}

export function otpauthUrl(secret: string, account: string, issuer = 'IS Fleet') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
}

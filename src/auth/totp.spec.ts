import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCode,
  verifyTotp,
} from './totp';

// RFC 6238 appendix B: secret "12345678901234567890", SHA-1, 6 digits = last 6 of the 8-digit vectors.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(totpCode(RFC_SECRET, 1111111109_000)).toBe('081804');
    expect(totpCode(RFC_SECRET, 1234567890_000)).toBe('005924');
  });

  it('base32 round-trips', () => {
    const s = generateTotpSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it('accepts one step of drift, rejects two', () => {
    const t = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, t);
    expect(verifyTotp(RFC_SECRET, code, t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, t + 30_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, t + 90_000)).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345')).toBe(false);
  });
});

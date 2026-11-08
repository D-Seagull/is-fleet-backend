import {
  assertTotpOk,
  hashRecoveryCode,
  openSecret,
  sealSecret,
  totpKey,
} from './admin-totp';
import { generateTotpSecret, totpCode } from './totp';

const key = totpKey({ JWT_SECRET: 'x'.repeat(40) });

function adminRow(over = {}) {
  const secret = generateTotpSecret();
  return {
    secret,
    row: {
      id: 'a1',
      totpSecret: sealSecret(secret, key),
      totpEnabledAt: new Date(),
      totpRecoveryCodes: [hashRecoveryCode('ABCD-2345', key)],
      ...over,
    },
  };
}

describe('admin totp', () => {
  it('seals and opens a secret', () => {
    const s = generateTotpSecret();
    expect(openSecret(sealSecret(s, key), key)).toBe(s);
  });

  it('does nothing when 2FA is off', async () => {
    const { row } = adminRow({ totpEnabledAt: null });
    await expect(assertTotpOk(row, undefined, key, jest.fn())).resolves.toBeUndefined();
  });

  it('asks for a code when on and none given', async () => {
    const { row } = adminRow();
    await expect(assertTotpOk(row, undefined, key, jest.fn())).rejects.toThrow('errors.totpRequired');
  });

  it('accepts a right code and rejects a wrong one', async () => {
    const { row, secret } = adminRow();
    await expect(assertTotpOk(row, totpCode(secret), key, jest.fn())).resolves.toBeUndefined();
    await expect(assertTotpOk(row, '000000', key, jest.fn())).rejects.toThrow('errors.totpInvalid');
  });

  it('a recovery code works once and is consumed', async () => {
    const { row } = adminRow();
    const consume = jest.fn();
    await assertTotpOk(row, 'abcd-2345', key, consume);
    expect(consume).toHaveBeenCalledWith('a1', []);
  });
});

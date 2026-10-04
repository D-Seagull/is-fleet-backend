import { isPhoneOnScreen, PULSE_TTL_MS } from './phone-on-screen';

describe('isPhoneOnScreen', () => {
  const now = 1_000_000;

  it('ignores web / desktop sockets and backgrounded phones', () => {
    expect(isPhoneOnScreen({ mobile: false, active: true }, now)).toBe(false);
    expect(isPhoneOnScreen({ mobile: true, active: false, pulseAt: now }, now)).toBe(false);
    expect(isPhoneOnScreen(undefined, now)).toBe(false);
  });

  it('trusts a pulsing phone only while the last pulse is fresh', () => {
    expect(isPhoneOnScreen({ mobile: true, active: true, pulseAt: now - 10_000 }, now)).toBe(true);
    // appBackground got lost when the phone locked — pushes resume after the TTL.
    expect(
      isPhoneOnScreen({ mobile: true, active: true, pulseAt: now - PULSE_TTL_MS }, now),
    ).toBe(false);
  });

  it('keeps the old behaviour for builds that never pulse', () => {
    expect(isPhoneOnScreen({ mobile: true, active: true }, now)).toBe(true);
  });
});

import { isPhoneOnScreen, isSocketActive, PULSE_TTL_MS } from './phone-on-screen';

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

describe('isSocketActive', () => {
  const now = 1_000_000;

  it('counts a phone exactly like isPhoneOnScreen', () => {
    expect(isSocketActive({ mobile: true, active: true, pulseAt: now - 5_000 }, now)).toBe(true);
    expect(isSocketActive({ mobile: true, active: false, pulseAt: now }, now)).toBe(false);
  });

  it('counts the web only while it pulses (window in use)', () => {
    expect(isSocketActive({ web: true, active: true, pulseAt: now - 5_000 }, now)).toBe(true);
    // Desktop left open on an empty desk: pulses stopped → the phone rings again.
    expect(isSocketActive({ web: true, active: true, pulseAt: now - PULSE_TTL_MS }, now)).toBe(false);
    expect(isSocketActive({ web: true, active: false, pulseAt: now }, now)).toBe(false);
  });

  it('never counts a web build that does not pulse, or an unknown client', () => {
    expect(isSocketActive({ web: true, active: true }, now)).toBe(false);
    expect(isSocketActive({ active: true, pulseAt: now }, now)).toBe(false);
    expect(isSocketActive(undefined, now)).toBe(false);
  });
});

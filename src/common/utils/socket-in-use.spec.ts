import { isSocketActive, PULSE_TTL_MS } from './socket-in-use';

describe('isSocketActive', () => {
  const now = 1_000_000;

  it('counts the web only while it pulses (window in use)', () => {
    expect(
      isSocketActive({ web: true, active: true, pulseAt: now - 5_000 }, now),
    ).toBe(true);
    // Desktop left open on an empty desk: pulses stopped → the phone rings again.
    expect(
      isSocketActive(
        { web: true, active: true, pulseAt: now - PULSE_TTL_MS },
        now,
      ),
    ).toBe(false);
    expect(
      isSocketActive({ web: true, active: false, pulseAt: now }, now),
    ).toBe(false);
  });

  it('never counts a phone — the app decides on screen itself', () => {
    // Even right after a pulse: the phone may have locked a second later.
    expect(
      isSocketActive({ mobile: true, active: true, pulseAt: now }, now),
    ).toBe(false);
    expect(isSocketActive({ mobile: true, active: true }, now)).toBe(false);
  });

  it('never counts a web build that does not pulse, or an unknown client', () => {
    expect(isSocketActive({ web: true, active: true }, now)).toBe(false);
    expect(isSocketActive({ active: true, pulseAt: now }, now)).toBe(false);
    expect(isSocketActive(undefined, now)).toBe(false);
  });
});

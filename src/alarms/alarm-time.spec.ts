import { nextFireTime } from './alarm-time';

describe('nextFireTime', () => {
  const WAW = 'Europe/Warsaw';

  it('returns null for one-shot alarms', () => {
    const t = new Date('2026-10-20T05:00:00Z');
    expect(nextFireTime(t, 'NONE', WAW, t)).toBeNull();
  });

  it('keeps the wall-clock time across the autumn DST change', () => {
    // 07:00 Warsaw on Sat 24 Oct (CEST, UTC+2) → 07:00 on Sun 25 Oct (CET, UTC+1)
    const prev = new Date('2026-10-24T05:00:00Z');
    expect(nextFireTime(prev, 'DAILY', WAW, prev)?.toISOString()).toBe(
      '2026-10-25T06:00:00.000Z',
    );
  });

  it('keeps the wall-clock time across the spring DST change', () => {
    // 07:00 Warsaw on Sat 27 Mar 2027 (CET, UTC+1) → 07:00 on Sun 28 Mar (CEST, UTC+2)
    const prev = new Date('2027-03-27T06:00:00Z');
    expect(nextFireTime(prev, 'DAILY', WAW, prev)?.toISOString()).toBe(
      '2027-03-28T05:00:00.000Z',
    );
  });

  it('steps weekly alarms by 7 local days', () => {
    const prev = new Date('2026-10-20T05:00:00Z'); // Tue 07:00 CEST
    expect(nextFireTime(prev, 'WEEKLY', WAW, prev)?.toISOString()).toBe(
      '2026-10-27T06:00:00.000Z', // Tue 07:00 CET
    );
  });

  it('skips occurrences missed while the server was down', () => {
    const prev = new Date('2026-11-02T06:00:00Z'); // Mon 07:00 CET
    const now = new Date('2026-11-05T12:00:00Z');
    expect(nextFireTime(prev, 'DAILY', WAW, now)?.toISOString()).toBe(
      '2026-11-06T06:00:00.000Z',
    );
  });

  it('falls back to UTC when the user has no timezone', () => {
    const prev = new Date('2026-10-24T05:00:00Z');
    expect(nextFireTime(prev, 'DAILY', null, prev)?.toISOString()).toBe(
      '2026-10-25T05:00:00.000Z',
    );
  });
});

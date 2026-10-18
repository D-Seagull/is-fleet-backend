import { AlarmRecurrence } from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Parses the client-supplied `time` as wall-clock in the given IANA timezone.
 *
 * - If the string carries a timezone marker (`Z` or `±HH:MM`) → respect it
 *   (already absolute, no conversion).
 * - Otherwise (e.g. "2026-05-09T14:00:00") → interpret as wall-clock in `tz`.
 *   Falls back to UTC when `tz` is missing.
 */
export function parseAlarmTime(input: string, tz: string | null | undefined): Date {
  const hasTzSuffix = /Z$|[+-]\d{2}:?\d{2}$/.test(input);
  if (hasTzSuffix) return new Date(input);
  return fromZonedTime(input, tz ?? 'UTC');
}

/**
 * Next occurrence of a recurring alarm, stepped in the target's wall-clock
 * time — so a 07:00 Warsaw alarm stays 07:00 across a DST change (adding 24h
 * of absolute time would ring at 06:00 / 08:00). Occurrences missed while the
 * server was down are skipped, not fired one per minute.
 */
export function nextFireTime(
  prev: Date,
  recurrence: AlarmRecurrence,
  tz: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (recurrence === 'NONE') return null;
  const days = recurrence === 'WEEKLY' ? 7 : 1;
  const zone = tz ?? 'UTC';
  let next = prev;
  do {
    // Wall clock in `zone`, shifted by whole days with UTC math (no server-TZ
    // involvement), then resolved back to an absolute moment in `zone`.
    const wall = new Date(
      formatInTimeZone(next, zone, "yyyy-MM-dd'T'HH:mm:ss.SSS") + 'Z',
    );
    wall.setUTCDate(wall.getUTCDate() + days);
    next = fromZonedTime(wall.toISOString().slice(0, 23), zone);
  } while (next <= now);
  return next;
}

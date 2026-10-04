/**
 * Is this socket a phone app that is open on screen right now?
 *
 * Chat pushes are held back while the recipient's phone app is on screen (the
 * message already shows in-app). The app reports foreground / background with
 * `appActive` / `appBackground`, but a one-off signal can be lost: the phone
 * locks and freezes the app before `appBackground` goes out, or the socket
 * reconnects while backgrounded (a fresh socket starts as "active"). The
 * server then kept believing the app was open and swallowed every chat push.
 *
 * Apps that pulse (`appActive` with `{ pulse: true }` every 15 s while on
 * screen, and `pulse: true` in the handshake) are trusted only while the last
 * pulse is fresh — a lost signal now costs at most PULSE_TTL_MS. Older builds
 * that never pulse keep the old behaviour, so nothing changes for them until
 * they update.
 */
export const PULSE_TTL_MS = 45_000;

export interface PhoneSocketData {
  mobile?: boolean;
  active?: boolean;
  /** ms timestamp of the last pulse; set only for pulsing clients. */
  pulseAt?: number;
}

export function isPhoneOnScreen(
  data: PhoneSocketData | undefined,
  now = Date.now(),
): boolean {
  if (data?.mobile !== true || data.active !== true) return false;
  if (typeof data.pulseAt === 'number') return now - data.pulseAt < PULSE_TTL_MS;
  return true;
}

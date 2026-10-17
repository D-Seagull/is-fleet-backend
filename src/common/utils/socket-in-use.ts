/**
 * Is the person using the web / desktop app on this socket right now?
 *
 * PushService holds a push back (and shows the news in-app instead) only for
 * this. The web pulses (`appActive` with `{ pulse: true }` every 15 s) just
 * while the window is visible, focused and touched within the last couple of
 * minutes, so a desktop left open on an empty desk stops counting within
 * PULSE_TTL_MS and the phone rings again. Web builds that don't pulse never
 * count.
 *
 * Phones never count. A phone app used to hold its own pushes back while on
 * screen, but the server learns "off screen" late or not at all: the phone
 * locks and freezes the app before `appBackground` goes out, and every push
 * until the last pulse went stale was dropped — a locked phone stayed silent.
 * Now every push reaches the phone and the app decides the moment it lands
 * (lib/push.ts in the mobile apps): on screen → no banner, no sound, the app
 * shows it itself; otherwise the phone rings.
 */
export const PULSE_TTL_MS = 45_000;

export interface SocketPresenceData {
  /** Phone app (handshake `client: 'mobile'`). */
  mobile?: boolean;
  /** Web / desktop client (handshake `client: 'web'`). */
  web?: boolean;
  active?: boolean;
  /** ms timestamp of the last pulse. */
  pulseAt?: number;
  /** Client shows in-app notices sent as the `notice` socket event. */
  notices?: boolean;
}

export function isSocketActive(
  data: SocketPresenceData | undefined,
  now = Date.now(),
): boolean {
  if (data?.web !== true || data.active !== true) return false;
  return typeof data.pulseAt === 'number' && now - data.pulseAt < PULSE_TTL_MS;
}

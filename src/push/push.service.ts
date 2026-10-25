import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from 'src/prisma/prisma.service';
import { FCM_PLATFORM, FcmService } from './fcm.service';
import { PresenceService } from './presence.service';

/**
 * What to do for a recipient who is using the web / desktop app right now —
 * the phone shouldn't buzz while the news is on the screen in front of them.
 * (Phones always get the push; an app on screen keeps the banner and sound
 * away itself — see `isSocketActive`.)
 *  - `notice` (default): show it in-app instead — the `notice` socket event
 *    goes to the sockets in use; clients too old to show it still get the push;
 *  - `skip`: nothing — the app already shows it (chat messages, or questions
 *    that have their own socket event like "heading to loading?");
 *  - `push`: push anyway (alarms must ring whatever the user is doing).
 */
export type WhenActive = 'notice' | 'skip' | 'push';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** iOS notification category — drives the action buttons. */
  categoryId?: string;
  /** `'default'`/undefined for the OS default, a bundled filename (must be
   *  registered in each app's app.json expo-notifications `sounds`) for a
   *  custom chime, or `null` for silent. */
  sound?: string | null;
  /** Android notification channel. On Android 8+ the SOUND comes from the
   *  channel (created by the app), not from `sound` — e.g. `messages`. */
  channelId?: string;
  /** Bypass the SLEEP/VACATION do-not-disturb gate. Use for
   *  alarms — an alarm clock must ring regardless of presence status. */
  ignoreDnd?: boolean;
  /** iOS: `time-sensitive` breaks through Focus modes (alarms). */
  interruptionLevel?: 'active' | 'time-sensitive';
  /** Recipient using the app right now — see {@link WhenActive}. */
  whenActive?: WhenActive;
}

/**
 * Sends Expo push notifications to one or more users (multi-device aware).
 * Invalid tokens (DeviceNotRegistered) are pruned from the DB so we don't
 * keep retrying them.
 */
// On Android the SOUND belongs to the channel, not to the push. `messages`
// is created by both apps (HIGH importance, push_message.mp3 — lib/push.ts),
// so pushes about trips and statuses use it too, to sound like IS Fleet.
// `sound` covers iOS, where the push itself names the file.
//
// Channels are fixed once created on a phone, so improving one means a NEW
// channel id: `chat` (MAX importance, shown in full on the lock screen) took
// over from `messages`, and `alarm` (alarm audio stream, rings through
// silent mode) from `default`. A device gets the new channel only if its
// app reported creating it (PushToken.channels) — Android silently drops a
// push aimed at a channel the phone doesn't have, so older app versions
// keep getting the old one (FALLBACK_CHANNEL).
const BRAND_CHANNEL = 'chat';
const BRAND_SOUND = 'push_message.mp3';
const FALLBACK_CHANNEL: Record<string, string> = {
  chat: 'messages',
  alarm: 'default',
};

/** The channel to use on this device: the asked one if it has it. */
export function channelFor(asked: string, deviceChannels: string[]): string {
  if (!(asked in FALLBACK_CHANNEL) || deviceChannels.includes(asked)) {
    return asked;
  }
  return FALLBACK_CHANNEL[asked];
}

// Raw FCM tokens (the FCM experiment) live in PushToken too — keep them out
// of the Expo path, which would drop them as "invalid format". `platform` is
// NULL on old rows, and `not` alone would skip those as well.
const NOT_FCM = { OR: [{ platform: null }, { platform: { not: FCM_PLATFORM } }] };

// Receipts are ready a few seconds to minutes after sending.
const RECEIPT_DELAY_MS = 60_000;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
    private fcm: FcmService,
  ) {}

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await this.sendLocalizedToUsers(
      userIds,
      () => ({ title: payload.title, body: payload.body }),
      {
        data: payload.data,
        categoryId: payload.categoryId,
        sound: payload.sound,
        channelId: payload.channelId,
        ignoreDnd: payload.ignoreDnd,
        interruptionLevel: payload.interruptionLevel,
        whenActive: payload.whenActive,
      },
    );
  }

  /**
   * Like {@link sendToUsers}, but builds the title/body separately for each
   * recipient from their `User.language`, so every device gets the banner in
   * its own language. `build(lang)` receives the recipient's language code
   * (UK/EN/PL/LT/RU…) and returns the localized text — use `t(lang, …)`.
   */
  async sendLocalizedToUsers(
    userIds: string[],
    build: (lang: string) => { title: string; body: string },
    extra: {
      data?: Record<string, unknown>;
      categoryId?: string;
      sound?: string | null;
      channelId?: string;
      ignoreDnd?: boolean;
      interruptionLevel?: 'active' | 'time-sensitive';
      whenActive?: WhenActive;
    } = {},
  ): Promise<void> {
    if (userIds.length === 0) return;

    // `language` drives per-recipient text (the push and the in-app notice).
    const allRecipients = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, status: true, statusUntil: true, lastSeenAt: true, language: true },
    });
    // A representative label (source language) just for the server logs.
    const label = build('uk').title;

    // Presence gate: whoever is working on the web / desktop right now gets
    // it there, and their phone stays quiet. Everyone else gets the push.
    const recipients = await this.applyPresence(
      allRecipients,
      build,
      extra,
      label,
    );
    if (recipients.length === 0) return;

    // Skip recipients who are SLEEP / VACATION (with a still-valid
    // statusUntil, or no timer at all). This is the do-not-disturb gate
    // — the message itself still lands via socket; we only silence the
    // banner. ONLINE / AWAY / BUSY recipients and those whose timer already
    // expired stay in the list.
    const now = Date.now();
    // Alarms bypass do-not-disturb entirely — an alarm clock must ring in
    // every status (incl. VACATION/SLEEP). Otherwise apply the DND gate.
    const deliver = extra.ignoreDnd
      ? recipients
      : recipients.filter((u) => {
          // AWAY is presence (web sets it after 15 min idle — exactly when the
          // phone must ring) and BUSY still wants work pushes (user decision
          // 2026-09-29). Only SLEEP / VACATION silence the banner.
          if (
            u.status === 'ONLINE' ||
            u.status === 'AWAY' ||
            u.status === 'BUSY'
          )
            return true;
          // SLEEP / VACATION: deliver only if the timer already expired.
          return !!u.statusUntil && u.statusUntil.getTime() <= now;
        });
    const langById = new Map<string, string>(
      deliver.map((u) => [u.id, u.language]),
    );
    const deliverIds = deliver.map((u) => u.id);
    if (deliverIds.length === 0) {
      this.logger.log(
        `Push "${label}" suppressed for all ${recipients.length} recipient(s) (SLEEP/VACATION)`,
      );
      return;
    }

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: deliverIds }, ...NOT_FCM },
      select: { token: true, userId: true, channels: true },
    });
    this.logger.log(
      `Push "${label}" → users=[${deliverIds.join(',')}] tokens=${tokens.length}`,
    );
    if (tokens.length === 0) {
      this.logger.warn(
        `No push tokens for users=[${deliverIds.join(',')}] — recipient(s) won't receive "${label}". Check that the mobile app registered a token after login.`,
      );
      return;
    }

    const messages: ExpoPushMessage[] = [];
    const validTokens: string[] = [];
    for (const { token, userId, channels } of tokens) {
      if (!Expo.isExpoPushToken(token)) {
        this.logger.warn(`Drop invalid token format: ${token}`);
        await this.prisma.pushToken.deleteMany({ where: { token } });
        continue;
      }
      const { title, body } = build(langById.get(userId) ?? 'uk');
      validTokens.push(token);
      messages.push({
        to: token,
        // Every push we send is something a person should see now (a chat
        // message, a trip change, an alarm). Without this Expo sends normal
        // priority, which Android holds back in Doze — pushes to a locked
        // phone arrived minutes late and batched, often silently.
        priority: 'high',
        sound: extra.sound === null ? undefined : (extra.sound ?? BRAND_SOUND),
        title,
        body,
        data: extra.data,
        categoryId: extra.categoryId,
        // Always name an Android channel. Without one Expo falls back to its
        // own "Default" channel, which the apps never configured — trip and
        // status pushes landed there and stayed silent on a locked phone.
        // Everything rings with the IS Fleet chime unless the caller says
        // otherwise (alarms keep `default`).
        channelId: channelFor(extra.channelId ?? BRAND_CHANNEL, channels ?? []),
        ...(extra.interruptionLevel
          ? { interruptionLevel: extra.interruptionLevel }
          : {}),
      });
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      try {
        const part = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...part);
      } catch (e) {
        this.logger.error('Expo push send failed', e as Error);
      }
    }
    const okCount = tickets.filter((t) => t.status === 'ok').length;
    this.logger.log(
      `Push "${label}" → ${okCount}/${tickets.length} accepted by Expo`,
    );

    // "ok" only means Expo accepted the push. Whether FCM / APNs delivered it
    // shows up in the receipt a little later — log failures so a push that
    // never reached the phone is visible in the server logs.
    const receiptIds = tickets
      .map((tk) => (tk.status === 'ok' ? tk.id : null))
      .filter((id): id is string => !!id);
    if (receiptIds.length > 0) {
      // unref: a pending check must never keep the process (or a test) alive.
      setTimeout(
        () => void this.checkReceipts(label, receiptIds),
        RECEIPT_DELAY_MS,
      ).unref();
    }

    // Prune tokens that Expo rejected outright (e.g. uninstalled app).
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status === 'error') {
          const code = ticket.details?.error;
          this.logger.warn(
            `Push ticket error: ${ticket.message ?? '?'} (code=${code ?? '?'})`,
          );
          if (code === 'DeviceNotRegistered') {
            const badToken = validTokens[i];
            if (badToken) {
              await this.prisma.pushToken.deleteMany({
                where: { token: badToken },
              });
            }
          }
        }
      }),
    );
  }

  /**
   * Splits recipients by presence and returns the ones who still need a push.
   * Those working on the web / desktop right now get the `notice` socket event
   * on the sockets in use (not on the phone — it would queue a modal for
   * something already read on the desktop), or nothing for `skip`.
   */
  private async applyPresence<
    U extends { id: string; language: string },
  >(
    recipients: U[],
    build: (lang: string) => { title: string; body: string },
    extra: { data?: Record<string, unknown>; whenActive?: WhenActive },
    label: string,
  ): Promise<U[]> {
    const whenActive = extra.whenActive ?? 'notice';
    if (whenActive === 'push' || recipients.length === 0) return recipients;

    const active = await this.presence.activeSockets(recipients.map((u) => u.id));
    if (active.size === 0) return recipients;

    const inApp: string[] = [];
    const rest = recipients.filter((u) => {
      const sockets = active.get(u.id);
      if (!sockets) return true;
      if (whenActive === 'skip') {
        inApp.push(u.id);
        return false;
      }
      // Clients that predate the `notice` event would show nothing — they
      // keep getting the push, exactly as before.
      const capable = sockets.filter((s) => s.data?.notices === true);
      if (capable.length === 0) return true;
      const { title, body } = build(u.language);
      for (const s of capable) s.emit('notice', { title, body, data: extra.data });
      inApp.push(u.id);
      return false;
    });

    if (inApp.length > 0) {
      this.logger.log(
        `Push "${label}" → ${whenActive === 'skip' ? 'not needed, app in use' : 'shown in-app'} for users=[${inApp.join(',')}]`,
      );
    }
    return rest;
  }

  /**
   * EXPERIMENT: a test push to the caller's own Android phone(s), `delaySec`
   * from now (time to lock the phone), through Expo or straight through FCM
   * (see FcmService). The body carries the send time, so the banner shows
   * how late it arrived. Bypasses every gate — it's a delivery test.
   */
  async sendTest(
    userId: string,
    via: 'expo' | 'fcm',
    delaySec: number,
  ): Promise<{ scheduled: boolean; tokens: number; reason?: string }> {
    if (via === 'fcm' && !this.fcm.enabled) {
      return { scheduled: false, tokens: 0, reason: 'FCM_NOT_CONFIGURED' };
    }
    const tokens = await this.prisma.pushToken.findMany({
      where:
        via === 'fcm'
          ? { userId, platform: FCM_PLATFORM }
          : { userId, platform: 'android' },
      select: { token: true, channels: true },
    });
    if (tokens.length === 0) return { scheduled: false, tokens: 0, reason: 'NO_TOKENS' };
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });

    setTimeout(() => {
      void (async () => {
        const at = new Date().toLocaleTimeString('uk-UA', {
          timeZone: user?.timezone || 'Europe/Warsaw',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const title = `🧪 Push test · ${via.toUpperCase()}`;
        const body = `Sent at ${at}`;
        const data = { type: 'TEST', via };
        for (const { token, channels } of tokens) {
          const channelId = channelFor(BRAND_CHANNEL, channels ?? []);
          if (via === 'fcm') {
            const r = await this.fcm.send(token, { title, body, data, channelId, sound: BRAND_SOUND });
            if (!r.ok && r.code === 'UNREGISTERED') {
              await this.prisma.pushToken.deleteMany({ where: { token } });
            }
          } else {
            try {
              const [ticket] = await this.expo.sendPushNotificationsAsync([
                { to: token, priority: 'high', sound: BRAND_SOUND, title, body, data, channelId },
              ]);
              this.logger.log(`Push test EXPO → ${ticket?.status ?? '?'}`);
            } catch (e) {
              this.logger.warn(`Push test EXPO failed: ${(e as Error).message}`);
            }
          }
        }
        this.logger.log(`Push test ${via} sent at ${at} to ${tokens.length} token(s) of ${userId}`);
      })();
    }, delaySec * 1000);
    return { scheduled: true, tokens: tokens.length };
  }

  /** Log delivery failures from Expo receipts (FCM / APNs errors). */
  private async checkReceipts(label: string, ids: string[]): Promise<void> {
    try {
      for (const chunk of this.expo.chunkPushNotificationReceiptIds(ids)) {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        for (const [id, r] of Object.entries(receipts)) {
          if (r.status === 'ok') continue;
          this.logger.warn(
            `Push "${label}" NOT delivered (receipt ${id}): ${r.message ?? '?'} (code=${r.details?.error ?? '?'})`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(`Push receipts check failed: ${(e as Error).message}`);
    }
  }
}

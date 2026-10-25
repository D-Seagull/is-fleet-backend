import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

/** PushToken.platform of a raw FCM registration token (Android only). */
export const FCM_PLATFORM = 'android-fcm';

export interface FcmPayload {
  title: string;
  body: string;
  /** Same shape as Expo's `data` — what the app reads as `content.data`. */
  data?: Record<string, unknown>;
  channelId: string;
  /** Bundled sound file; on Android 8+ the channel's sound wins anyway. */
  sound?: string;
}

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

/**
 * EXPERIMENT (2026-10-25): Android pushes straight through FCM v1 as a
 * *notification* message instead of through Expo.
 *
 * Expo sends Android a data-only message: the phone has to wake our app so
 * expo-notifications can build the banner, and a locked phone that keeps the
 * app asleep (battery restrictions, OEM firmware) holds it until unlock. A
 * notification message is shown by Google Play services itself — no app
 * start needed. expo-notifications still handles it: in the foreground it
 * goes through the app's notification handler, a tap on the system banner
 * reaches the JS response listener (it reads `data.body`, like Expo's).
 *
 * Credentials: the Firebase service account (project `is-fleet`, the one
 * both apps' google-services.json belong to) as JSON in
 * `FCM_SERVICE_ACCOUNT`, or a file path in `FCM_SERVICE_ACCOUNT_FILE`.
 * Without them `enabled` is false and nothing is sent.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly account: ServiceAccount | null = this.loadAccount();
  private readonly auth = this.account
    ? new GoogleAuth({
        credentials: {
          client_email: this.account.client_email,
          private_key: this.account.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      })
    : null;

  get enabled(): boolean {
    return this.auth !== null;
  }

  /** Reads the credentials and says in the boot log why FCM is off. */
  private loadAccount(): ServiceAccount | null {
    const inline = process.env.FCM_SERVICE_ACCOUNT;
    const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
    const source = inline
      ? 'FCM_SERVICE_ACCOUNT'
      : file
        ? 'FCM_SERVICE_ACCOUNT_FILE'
        : null;
    if (!source) {
      this.logger.log(
        'FCM off: neither FCM_SERVICE_ACCOUNT nor FCM_SERVICE_ACCOUNT_FILE is set',
      );
      return null;
    }
    try {
      let raw = (inline ?? readFileSync(file!, 'utf8')).trim();
      // A value pasted into a dashboard wrapped in quotes.
      const q = raw[0];
      if ((q === "'" || q === '"') && raw.endsWith(q)) raw = raw.slice(1, -1);
      const json = JSON.parse(raw) as Partial<ServiceAccount>;
      const missing = (
        ['project_id', 'client_email', 'private_key'] as const
      ).filter((k) => !json[k]);
      if (missing.length > 0) {
        this.logger.warn(`FCM off: ${source} has no ${missing.join(', ')}`);
        return null;
      }
      this.logger.log(`FCM on: project ${json.project_id} (${source})`);
      return json as ServiceAccount;
    } catch (e) {
      this.logger.warn(
        `FCM off: ${source} can't be read as JSON — ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Send one notification message. Resolves to `ok` or the FCM error code
   * (`UNREGISTERED` = the app was uninstalled / the token rotated).
   */
  async send(
    token: string,
    p: FcmPayload,
  ): Promise<{ ok: true } | { ok: false; code: string }> {
    if (!this.auth || !this.account)
      return { ok: false, code: 'NOT_CONFIGURED' };
    const data = p.data ?? {};
    const message = {
      token,
      notification: { title: p.title, body: p.body },
      // FCM data values must be strings. expo-notifications reads the app's
      // `content.data` from a JSON string under `body` — same as Expo does.
      data: { title: p.title, message: p.body, body: JSON.stringify(data) },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: p.channelId,
          ...(p.sound ? { sound: p.sound.replace(/\.[a-z0-9]+$/i, '') } : {}),
          notification_priority: 'PRIORITY_MAX',
          visibility: 'PUBLIC',
          default_vibrate_timings: true,
        },
      },
    };
    try {
      const client = await this.auth.getClient();
      const res = await client.request<{ name?: string }>({
        url: `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
        method: 'POST',
        data: { message },
      });
      this.logger.log(`FCM sent ${res.data.name ?? ''}`);
      return { ok: true };
    } catch (e) {
      const err = e as {
        response?: {
          data?: {
            error?: {
              status?: string;
              message?: string;
              details?: { errorCode?: string }[];
            };
          };
        };
        message?: string;
      };
      const fcm = err.response?.data?.error;
      const code =
        fcm?.details?.find((d) => d.errorCode)?.errorCode ??
        fcm?.status ??
        'UNKNOWN';
      this.logger.warn(
        `FCM send failed: ${code} — ${fcm?.message ?? err.message ?? '?'}`,
      );
      return { ok: false, code };
    }
  }
}

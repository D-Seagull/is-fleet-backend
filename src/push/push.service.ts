import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from 'src/prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** iOS notification category — drives the action buttons. */
  categoryId?: string;
  sound?: 'default' | null;
}

/**
 * Sends Expo push notifications to one or more users (multi-device aware).
 * Invalid tokens (DeviceNotRegistered) are pruned from the DB so we don't
 * keep retrying them.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(private prisma: PrismaService) {}

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0) return;

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    this.logger.log(
      `Push "${payload.title}" → users=[${userIds.join(',')}] tokens=${tokens.length}`,
    );
    if (tokens.length === 0) {
      this.logger.warn(
        `No push tokens for users=[${userIds.join(',')}] — recipient(s) won't receive "${payload.title}". Check that the mobile app registered a token after login.`,
      );
      return;
    }

    const messages: ExpoPushMessage[] = [];
    const validTokens: string[] = [];
    for (const { token } of tokens) {
      if (!Expo.isExpoPushToken(token)) {
        this.logger.warn(`Drop invalid token format: ${token}`);
        await this.prisma.pushToken.deleteMany({ where: { token } });
        continue;
      }
      validTokens.push(token);
      messages.push({
        to: token,
        sound: payload.sound === null ? undefined : 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data,
        categoryId: payload.categoryId,
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
      `Push "${payload.title}" → ${okCount}/${tickets.length} accepted by Expo`,
    );

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
}

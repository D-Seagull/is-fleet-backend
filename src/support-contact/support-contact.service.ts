import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { DirectMessagesService } from 'src/direct-messages/direct-messages.service';
import { DirectMessagesGateway } from 'src/direct-messages/direct-messages.gateway';
import { pushTitle } from 'src/push/push-titles';
import { t } from 'src/i18n/i18n';

export const CONTACT_NAME = { firstName: 'IS Fleet', lastName: 'contact' };

/**
 * "IS Fleet contact" — one built-in account (`User.isSystem`) that talks to
 * people through the ordinary 1-to-1 chat:
 *  - service notices land in the user's chat (sign-in with a manager code,
 *    phone changed by a manager, …) and push like any message;
 *  - users can reply, and platform admins answer as the contact from the
 *    admin support inbox (debugging, support).
 * It is an ADMIN-role row, which is what lets it chat across companies
 * (assertCanMessageUser); it has no phone, email or password, so nobody can
 * sign in as it. Created on first use, in the platform admin's company.
 */
@Injectable()
export class SupportContactService {
  private readonly logger = new Logger(SupportContactService.name);
  private contactId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private dms: DirectMessagesService,
    private dmGateway: DirectMessagesGateway,
    private push: PushService,
  ) {}

  /** The contact's user id, creating the row on first use (null: no admin yet). */
  async id(): Promise<string | null> {
    if (this.contactId) return this.contactId;
    const existing = await this.prisma.user.findFirst({
      where: { isSystem: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return (this.contactId = existing.id);

    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true, deletedAt: null, isSystem: false },
      select: { companyId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) {
      this.logger.warn('No platform admin yet — IS Fleet contact not created');
      return null;
    }
    const created = await this.prisma.user.create({
      data: {
        ...CONTACT_NAME,
        role: 'ADMIN',
        companyId: admin.companyId,
        isSystem: true,
        isActive: true,
      },
      select: { id: true },
    });
    this.logger.log(`IS Fleet contact created: ${created.id}`);
    return (this.contactId = created.id);
  }

  /**
   * A service notice into the user's chat, in their interface language.
   * Best effort — a failure is logged, never thrown.
   */
  async notify(
    userId: string,
    build: (locale: string) => string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { uiLocale: true },
      });
      if (!user) return;
      await this.send(userId, build(user.uiLocale));
    } catch (err) {
      this.logger.error(
        `Notice to ${userId} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Post `content` from the contact to `userId`: chat event + push. */
  async send(userId: string, content: string) {
    const contactId = await this.id();
    if (!contactId) return null;
    const message = await this.dms.createMessage(contactId, userId, content);

    this.dmGateway.server.to(`user:${contactId}`).emit('new_direct_message', message);
    this.dmGateway.server.to(`user:${userId}`).emit('new_direct_message', message);

    const senderName = `${CONTACT_NAME.firstName} ${CONTACT_NAME.lastName}`;
    await this.push.sendLocalizedToUsers(
      [userId],
      (lang) => ({
        title: pushTitle.direct(senderName, t(lang, 'push.newMessage')),
        body: content.slice(0, 200),
      }),
      {
        sound: 'push_message.mp3',
        channelId: 'chat',
        // Same as any chat message: the open chat shows it itself.
        whenActive: 'skip',
        data: { type: 'DM_MESSAGE', userId: contactId, messageId: message.id },
      },
    );
    return message;
  }

  // ── Admin support inbox: admins read and answer as the contact ──────────

  private async requireId() {
    const id = await this.id();
    if (!id) throw new NotFoundException('errors.userNotFound');
    return id;
  }

  async conversations() {
    return this.dms.getConversations(await this.requireId());
  }

  async messages(userId: string, opts: { take?: number; before?: Date }) {
    return this.dms.getMessages(await this.requireId(), userId, opts);
  }

  async markRead(userId: string) {
    await this.dms.markAsRead(await this.requireId(), userId);
    return { ok: true };
  }

  async reply(userId: string, content: string) {
    const exists = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isSystem: false },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('errors.userNotFound');
    return this.send(userId, content);
  }
}

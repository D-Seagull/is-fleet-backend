import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReactionsService } from '../reactions/reactions.service';

@Injectable()
export class DirectMessagesService {
  private readonly logger = new Logger(DirectMessagesService.name);
  constructor(
    private prisma: PrismaService,
    private reactions: ReactionsService,
  ) {}

  // Pagination: fetches the latest `take` messages older than `before`
  // (or the latest overall if no cursor). Result is returned in ASC order
  // so clients can append it to existing history without reversing.
  async getMessages(
    userId1: string,
    userId2: string,
    opts: { take?: number; before?: Date } = {},
  ) {
    const t0 = Date.now();
    const take = opts.take ?? 50;
    const rows = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
        ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    // Latest N fetched DESC; flip to ASC so the chat renders oldest-first.
    const messages = rows.reverse();
    const tMessages = Date.now() - t0;
    const t1 = Date.now();
    const reactionsByMsg = await this.reactions.getForMessages(
      'DM',
      messages.map((m) => m.id),
    );
    const tReactions = Date.now() - t1;
    this.logger.log(
      `getMessages DM (${userId1} ↔ ${userId2}) → messages=${tMessages}ms reactions=${tReactions}ms count=${messages.length}`,
    );
    return messages.map((m) => ({
      ...m,
      reactions: reactionsByMsg[m.id] ?? [],
    }));
  }

  createMessage(
    senderId: string,
    receiverId: string,
    content: string,
    replyToId?: string | null,
    replyToDocumentId?: string | null,
  ) {
    return this.prisma.directMessage.create({
      data: {
        senderId,
        receiverId,
        content,
        replyToId: replyToId ?? null,
        replyToDocumentId: replyToDocumentId ?? null,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });
  }

  // 3 fixed-cost queries instead of (1 huge findMany + N count() calls):
  //  1. raw SQL with ROW_NUMBER() to get the id of the latest message per peer
  //  2. one findMany to load those rows with sender + receiver populated
  //  3. one groupBy to fetch all unread counts (peer → me) at once
  async getConversations(userId: string) {
    const t0 = Date.now();

    const latestIds = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        WITH peers AS (
          SELECT
            id,
            CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END AS peer_id,
            ROW_NUMBER() OVER (
              PARTITION BY CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END
              ORDER BY "createdAt" DESC
            ) AS rn
          FROM "DirectMessage"
          WHERE "senderId" = ${userId} OR "receiverId" = ${userId}
        )
        SELECT id FROM peers WHERE rn = 1
      `,
    );

    if (latestIds.length === 0) {
      this.logger.log(`getConversations (${userId}) → empty in ${Date.now() - t0}ms`);
      return [];
    }

    const ids = latestIds.map((r) => r.id);
    const [messages, unreadGrouped] = await Promise.all([
      this.prisma.directMessage.findMany({
        where: { id: { in: ids } },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
          receiver: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        },
      }),
      this.prisma.directMessage.groupBy({
        by: ['senderId'],
        where: { receiverId: userId, isRead: false },
        _count: { _all: true },
      }),
    ]);

    const unreadByPeer = new Map(
      unreadGrouped.map((u) => [u.senderId, u._count._all]),
    );

    const result = messages
      .map((m) => {
        const peerId = m.senderId === userId ? m.receiverId : m.senderId;
        return {
          user: m.senderId === userId ? m.receiver : m.sender,
          lastMessage: m,
          unreadCount: unreadByPeer.get(peerId) ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime(),
      );

    this.logger.log(
      `getConversations (${userId}) → ${result.length} convs in ${Date.now() - t0}ms`,
    );
    return result;
  }
  async markAsRead(userId: string, senderId: string) {
    // Mark text messages as read.
    const messages = await this.prisma.directMessage.updateMany({
      where: {
        senderId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });
    // Mark documents in this conversation as read too (uploaded by senderId
    // for me as otherUser, OR sent to senderId from me — only inbound ones
    // need to be flipped, but we update both sides for simplicity and
    // idempotency since "false → true" is a no-op on already-read rows).
    await this.prisma.directMessageDocument.updateMany({
      where: {
        uploadedBy: senderId,
        otherUserId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });
    return messages;
  }
  async softDelete(messageId: string, userId: string) {
    const msg = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!msg) {
      throw new Error("Повідомлення не знайдене");
    }
    if (msg.senderId !== userId) {
      throw new Error("Ви можете видаляти лише свої повідомлення");
    }
    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: "" },
    });
  }

  // 15-minute edit window — mirrors Telegram-style behaviour for chat msgs.
  // Author-only; rejects deleted messages and stale edits.
  async editMessage(messageId: string, userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Повідомлення не може бути порожнім');
    }
    const msg = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!msg) {
      throw new Error('Повідомлення не знайдене');
    }
    if (msg.senderId !== userId) {
      throw new Error('Ви можете редагувати лише свої повідомлення');
    }
    if (msg.deletedAt) {
      throw new Error('Не можна редагувати видалене повідомлення');
    }
    const ageMs = Date.now() - msg.createdAt.getTime();
    if (ageMs > 15 * 60 * 1000) {
      throw new Error('Час на редагування минув (15 хв)');
    }
    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });
  }

  async getUnreadSummary(userId: string) {
    const conversations = await this.getConversations(userId);
    const items = conversations.filter((c) => c.unreadCount > 0);
    const total = items.reduce((sum, c) => sum + c.unreadCount, 0);
    return { total, items };
  }

  async getUnreadCount(userId: string, senderId: string) {
    return this.prisma.directMessage.count({
      where: {
        senderId,
        receiverId: userId,
        isRead: false,
      },
    });
  }
}

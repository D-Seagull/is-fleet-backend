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
    const beforeClause = opts.before
      ? Prisma.sql`AND "createdAt" < ${opts.before}`
      : Prisma.empty;

    // Messages + reactions in parallel — same wall-time gain as the trip
    // chat. Reactions subquery narrows to the same page-window.
    const [rows, reactionRows] = await Promise.all([
      this.prisma.directMessage.findMany({
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
      }),
      this.prisma.$queryRaw<
        Array<{ id: string; targetId: string; userId: string; emoji: string }>
      >(Prisma.sql`
        SELECT id, "targetId", "userId", emoji
        FROM "MessageReaction"
        WHERE "targetType" = 'DM'
          AND "targetId" IN (
            SELECT id FROM "DirectMessage"
            WHERE ("senderId" = ${userId1} AND "receiverId" = ${userId2})
               OR ("senderId" = ${userId2} AND "receiverId" = ${userId1})
              ${beforeClause}
            ORDER BY "createdAt" DESC
            LIMIT ${take}
          )
      `),
    ]);

    const reactionsByMsg = new Map<
      string,
      Array<{ id: string; userId: string; emoji: string }>
    >();
    for (const r of reactionRows) {
      let arr = reactionsByMsg.get(r.targetId);
      if (!arr) {
        arr = [];
        reactionsByMsg.set(r.targetId, arr);
      }
      arr.push({ id: r.id, userId: r.userId, emoji: r.emoji });
    }

    // Latest N fetched DESC; flip to ASC so the chat renders oldest-first.
    const messages = rows.reverse();
    this.logger.log(
      `getMessages DM (${userId1} ↔ ${userId2}) → ${Date.now() - t0}ms count=${messages.length} (parallel)`,
    );
    return messages.map((m) => ({
      ...m,
      reactions: reactionsByMsg.get(m.id) ?? [],
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

  // One SQL round-trip. CTEs compute the latest message id per peer, the
  // unread counts per peer, and json_build_object hydrates user + last
  // message in place — Postgres returns the final shape directly so JS
  // does no extra work.
  async getConversations(userId: string) {
    const t0 = Date.now();

    type Row = {
      user: {
        id: string;
        firstName: string;
        lastName: string | null;
        avatar: string | null;
        status: string | null;
        statusUntil: string | null;
        role: string;
      };
      last_message: {
        id: string;
        senderId: string;
        receiverId: string;
        content: string;
        isRead: boolean;
        createdAt: string;
        deletedAt: string | null;
        editedAt: string | null;
        replyToId: string | null;
        replyToDocumentId: string | null;
        sender: Row['user'];
        receiver: Row['user'];
      };
      unread_count: number;
    };

    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
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
      ),
      latest AS (
        SELECT id, peer_id FROM peers WHERE rn = 1
      ),
      unread AS (
        SELECT "senderId" AS peer_id, COUNT(*)::int AS unread_count
        FROM "DirectMessage"
        WHERE "receiverId" = ${userId} AND "isRead" = false
        GROUP BY "senderId"
      )
      SELECT
        json_build_object(
          'id', peer.id,
          'firstName', peer."firstName",
          'lastName', peer."lastName",
          'avatar', peer.avatar,
          'status', peer.status,
          'statusUntil', peer."statusUntil",
          'role', peer.role
        ) AS user,
        json_build_object(
          'id', m.id,
          'senderId', m."senderId",
          'receiverId', m."receiverId",
          'content', m.content,
          'isRead', m."isRead",
          'createdAt', m."createdAt",
          'deletedAt', m."deletedAt",
          'editedAt', m."editedAt",
          'replyToId', m."replyToId",
          'replyToDocumentId', m."replyToDocumentId",
          'sender', json_build_object(
            'id', s.id, 'firstName', s."firstName", 'lastName', s."lastName",
            'avatar', s.avatar, 'status', s.status, 'statusUntil', s."statusUntil",
            'role', s.role
          ),
          'receiver', json_build_object(
            'id', r.id, 'firstName', r."firstName", 'lastName', r."lastName",
            'avatar', r.avatar, 'status', r.status, 'statusUntil', r."statusUntil",
            'role', r.role
          )
        ) AS last_message,
        COALESCE(u.unread_count, 0) AS unread_count
      FROM latest l
      JOIN "DirectMessage" m ON m.id = l.id
      JOIN "User" peer ON peer.id = l.peer_id
      JOIN "User" s ON s.id = m."senderId"
      JOIN "User" r ON r.id = m."receiverId"
      LEFT JOIN unread u ON u.peer_id = l.peer_id
      ORDER BY m."createdAt" DESC
    `);

    this.logger.log(
      `getConversations (${userId}) → ${rows.length} convs in ${Date.now() - t0}ms (1 SQL)`,
    );

    return rows.map((r) => ({
      user: r.user,
      lastMessage: r.last_message,
      unreadCount: r.unread_count,
    }));
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

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ReactionsService } from 'src/reactions/reactions.service';
import { fullName } from 'src/common/utils/full-name';

@Injectable()
export class GroupMessagesService {
  constructor(
    private prisma: PrismaService,
    private reactions: ReactionsService,
  ) {}

  // Pagination: fetches the latest `take` messages older than `before`
  // (or the latest overall if no cursor). Result is returned in ASC order
  // so clients can append it to existing history without reversing.
  async getMessages(
    groupId: string,
    opts: { take?: number; before?: Date } = {},
  ) {
    const take = opts.take ?? 50;
    const beforeClause = opts.before
      ? Prisma.sql`AND "createdAt" < ${opts.before}`
      : Prisma.empty;

    // Messages + reactions in parallel — wall time = max(t1, t2) instead
    // of t1 + t2. Reactions subquery narrows to the same page-window.
    const [rows, reactionRows] = await Promise.all([
      this.prisma.groupMessage.findMany({
        where: {
          groupId,
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
        WHERE "targetType" = 'GROUP'
          AND "targetId" IN (
            SELECT id FROM "GroupMessage"
            WHERE "groupId" = ${groupId}
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
    return messages.map((m) => ({
      ...m,
      reactions: reactionsByMsg.get(m.id) ?? [],
    }));
  }

  async createMessage(
    groupId: string,
    senderId: string,
    content: string,
    replyToId?: string | null,
    replyToDocumentId?: string | null,
  ) {
    return await this.prisma.groupMessage.create({
      data: {
        groupId,
        senderId,
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

  async softDelete(messageId: string, userId: string) {
    const msg = await this.prisma.groupMessage.findUnique({
      where: { id: messageId },
    });
    if (!msg) throw new Error("Повідомлення не знайдене");
    if (msg.senderId !== userId) {
      throw new Error("Ви можете видаляти лише свої повідомлення");
    }
    return this.prisma.groupMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: "" },
    });
  }

  // 15-min edit window for group messages — author-only, rejects deleted &
  // stale edits. Returns the full updated row ready for emit to the group room.
  async editMessage(messageId: string, userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Повідомлення не може бути порожнім');
    }
    const msg = await this.prisma.groupMessage.findUnique({
      where: { id: messageId },
    });
    if (!msg) throw new Error('Повідомлення не знайдене');
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
    return this.prisma.groupMessage.update({
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

  /**
   * Mark every message in the group that the user hasn't read yet as read.
   * Uses createMany + skipDuplicates so re-marking is a no-op.
   */
  async markAsRead(userId: string, groupId: string) {
    const unread = await this.prisma.groupMessage.findMany({
      where: {
        groupId,
        senderId: { not: userId },
        reads: { none: { userId } },
      },
      select: { id: true },
    });
    if (unread.length === 0) return { count: 0 };
    await this.prisma.groupMessageRead.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });
    return { count: unread.length };
  }

  /**
   * Unread summary across ALL groups where the user is a manager (or
   * creator). One SQL round-trip — CTEs compute the user's groups, unread
   * messages in those groups, per-group counts, latest unread per group,
   * and json_build_object hydrates the snippet inline.
   */
  async getUnreadSummary(userId: string) {
    type Row = {
      groupId: string;
      name: string;
      unread_count: number;
      latest_message: {
        content: string;
        senderName: string;
        senderId: string;
        createdAt: string;
      };
    };

    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH user_groups AS (
        SELECT g.id, g.name
        FROM "Group" g
        WHERE g."createdBy" = ${userId}
           OR g.id IN (
             SELECT "groupId" FROM "GroupManager" WHERE "managerId" = ${userId}
           )
      ),
      unread AS (
        SELECT gm.id, gm."groupId", gm."senderId", gm.content, gm."createdAt"
        FROM "GroupMessage" gm
        WHERE gm."groupId" IN (SELECT id FROM user_groups)
          AND gm."senderId" != ${userId}
          AND NOT EXISTS (
            SELECT 1 FROM "GroupMessageRead" gmr
            WHERE gmr."messageId" = gm.id AND gmr."userId" = ${userId}
          )
      ),
      counts AS (
        SELECT "groupId", COUNT(*)::int AS unread_count
        FROM unread GROUP BY "groupId"
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "groupId" ORDER BY "createdAt" DESC
        ) AS rn
        FROM unread
      ),
      latest AS (SELECT * FROM ranked WHERE rn = 1)
      SELECT
        ug.id AS "groupId",
        ug.name,
        c.unread_count,
        json_build_object(
          'content', l.content,
          'senderName', TRIM(CONCAT_WS(' ', s."firstName", s."lastName")),
          'senderId', l."senderId",
          'createdAt', l."createdAt"
        ) AS latest_message
      FROM user_groups ug
      JOIN counts c ON c."groupId" = ug.id
      JOIN latest l ON l."groupId" = ug.id
      JOIN "User" s ON s.id = l."senderId"
      ORDER BY l."createdAt" DESC
    `);

    const items = rows.map((r) => ({
      groupId: r.groupId,
      name: r.name,
      unreadCount: r.unread_count,
      latestMessage: r.latest_message,
    }));
    const total = items.reduce((sum, i) => sum + i.unreadCount, 0);
    return { total, items };
  }
}

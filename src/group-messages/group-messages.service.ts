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
    const rows = await this.prisma.groupMessage.findMany({
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
    });
    // Latest N fetched DESC; flip to ASC so the chat renders oldest-first.
    const messages = rows.reverse();
    const reactionsByMsg = await this.reactions.getForMessages(
      'GROUP',
      messages.map((m) => m.id),
    );
    return messages.map((m) => ({
      ...m,
      reactions: reactionsByMsg[m.id] ?? [],
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
   * creator). Returns total + per-group items with name, count and latest
   * unread message snippet (Telegram-style).
   *
   * 4 fixed-cost queries instead of 1 + N findMany-per-group:
   *   1. groups the user belongs to
   *   2. groupBy { groupId, _count } over unread messages (sender != me,
   *      no read row for me) — gives counts in one round-trip
   *   3. raw SQL with ROW_NUMBER() to grab the id of the latest unread
   *      message per group in a single query
   *   4. findMany on those ids with the sender column populated
   */
  async getUnreadSummary(userId: string) {
    const groups = await this.prisma.group.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { managers: { some: { managerId: userId } } },
        ],
      },
      select: { id: true, name: true },
    });

    if (groups.length === 0) return { total: 0, items: [] };

    const groupIds = groups.map((g) => g.id);

    const counts = await this.prisma.groupMessage.groupBy({
      by: ['groupId'],
      where: {
        groupId: { in: groupIds },
        senderId: { not: userId },
        reads: { none: { userId } },
      },
      _count: { _all: true },
    });

    if (counts.length === 0) return { total: 0, items: [] };

    const unreadGroupIds = counts.map((c) => c.groupId);

    const latestIds = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        WITH ranked AS (
          SELECT gm.id, gm."groupId",
                 ROW_NUMBER() OVER (
                   PARTITION BY gm."groupId" ORDER BY gm."createdAt" DESC
                 ) AS rn
          FROM "GroupMessage" gm
          WHERE gm."groupId" IN (${Prisma.join(unreadGroupIds)})
            AND gm."senderId" != ${userId}
            AND NOT EXISTS (
              SELECT 1 FROM "GroupMessageRead" gmr
              WHERE gmr."messageId" = gm.id AND gmr."userId" = ${userId}
            )
        )
        SELECT id FROM ranked WHERE rn = 1
      `,
    );

    const latestMessages = await this.prisma.groupMessage.findMany({
      where: { id: { in: latestIds.map((r) => r.id) } },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });
    const latestByGroup = new Map(latestMessages.map((m) => [m.groupId, m]));
    const nameByGroup = new Map(groups.map((g) => [g.id, g.name]));
    const countByGroup = new Map(counts.map((c) => [c.groupId, c._count._all]));

    const items = unreadGroupIds
      .filter((gid) => latestByGroup.has(gid))
      .map((gid) => {
        const latest = latestByGroup.get(gid)!;
        return {
          groupId: gid,
          name: nameByGroup.get(gid) ?? '',
          unreadCount: countByGroup.get(gid) ?? 0,
          latestMessage: {
            content: latest.content,
            senderName: fullName(latest.sender),
            senderId: latest.senderId,
            createdAt: latest.createdAt,
          },
        };
      });

    const total = items.reduce((sum, i) => sum + i.unreadCount, 0);
    return { total, items };
  }
}

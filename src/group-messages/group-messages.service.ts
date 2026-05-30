import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ReactionsService } from 'src/reactions/reactions.service';

@Injectable()
export class GroupMessagesService {
  constructor(
    private prisma: PrismaService,
    private reactions: ReactionsService,
  ) {}

  async getMessages(groupId: string) {
    const messages = await this.prisma.groupMessage.findMany({
      where: { groupId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
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
  ) {
    return await this.prisma.groupMessage.create({
      data: { groupId, senderId, content, replyToId: replyToId ?? null },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, name: true } },
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
        sender: { select: { id: true, name: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, name: true } },
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
   */
  async getUnreadSummary(userId: string) {
    // Groups the user belongs to (as creator OR as a member in GroupManager).
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

    const items = await Promise.all(
      groups.map(async (g) => {
        const unread = await this.prisma.groupMessage.findMany({
          where: {
            groupId: g.id,
            senderId: { not: userId },
            reads: { none: { userId } },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            sender: { select: { id: true, name: true } },
          },
        });
        if (unread.length === 0) return null;
        const latest = unread[0];
        return {
          groupId: g.id,
          name: g.name,
          unreadCount: unread.length,
          latestMessage: {
            content: latest.content,
            senderName: latest.sender.name,
            senderId: latest.senderId,
            createdAt: latest.createdAt,
          },
        };
      }),
    );

    const filtered = items.filter(
      (i): i is NonNullable<typeof i> => i !== null,
    );
    const total = filtered.reduce((sum, i) => sum + i.unreadCount, 0);
    return { total, items: filtered };
  }
}

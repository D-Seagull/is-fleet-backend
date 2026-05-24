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

  async createMessage(groupId: string, senderId: string, content: string) {
    return await this.prisma.groupMessage.create({
      data: { groupId, senderId, content },
      include: {
        sender: { select: { id: true, name: true, role: true } },
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

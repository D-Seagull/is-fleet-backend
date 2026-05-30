import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReactionsService } from '../reactions/reactions.service';

@Injectable()
export class DirectMessagesService {
  constructor(
    private prisma: PrismaService,
    private reactions: ReactionsService,
  ) {}

  async getMessages(userId1: string, userId2: string) {
    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      },
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
      'DM',
      messages.map((m) => m.id),
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
  ) {
    return this.prisma.directMessage.create({
      data: { senderId, receiverId, content, replyToId: replyToId ?? null },
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

  async getConversations(userId: string) {
    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        receiver: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const conversations = new Map();
    messages.forEach((msg) => {
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!conversations.has(otherId)) {
        conversations.set(otherId, {
          user: msg.senderId === userId ? msg.receiver : msg.sender,
          lastMessage: msg,
          unreadCount: 0,
        });
      }
    });

    // Рахуємо непрочитані для кожної розмови
    for (const [otherId, conv] of conversations) {
      conv.unreadCount = await this.prisma.directMessage.count({
        where: {
          senderId: otherId,
          receiverId: userId,
          isRead: false,
        },
      });
    }

    return Array.from(conversations.values());
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

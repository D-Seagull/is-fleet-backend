import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DirectMessagesService {
  constructor(private prisma: PrismaService) {}

  getMessages(userId1: string, userId2: string) {
    return this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  createMessage(senderId: string, receiverId: string, content: string) {
    return this.prisma.directMessage.create({
      data: { senderId, receiverId, content },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
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

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
    return this.prisma.directMessage.updateMany({
      where: {
        senderId,
        receiverId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });
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

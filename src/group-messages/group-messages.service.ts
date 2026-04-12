import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GroupMessagesService {
  constructor(private prisma: PrismaService) {}

  async getMessages(groupId: string) {
    return await this.prisma.groupMessage.findMany({
      where: { groupId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMessage(groupId: string, senderId: string, content: string) {
    return await this.prisma.groupMessage.create({
      data: { groupId, senderId, content },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }
}

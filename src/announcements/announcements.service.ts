import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { MessagesGateway } from 'src/messages/messages.gateway';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private messagesGateway: MessagesGateway,
  ) {}

  async create(companyId: string, userId: string, dto: CreateAnnouncementDto) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        target: dto.target ?? 'ALL',
        groupId: dto.groupId,
        companyId,
        createdBy: userId,
      },
    });

    // знаходимо отримувачів
    let recipients: { id: string }[] = [];

    if (dto.groupId) {
      // по групі
      const group = await this.prisma.group.findFirst({
        where: { id: dto.groupId },
        include: {
          trucks: { include: { truck: { select: { currentDriverId: true } } } },
          dispatchers: { select: { dispatcherId: true } },
        },
      });

      if (group?.type === 'TRUCKS') {
        recipients = group.trucks
          .filter((t) => t.truck.currentDriverId)
          .map((t) => ({ id: t.truck.currentDriverId! }));
      } else if (group?.type === 'DISPATCHERS') {
        recipients = group.dispatchers.map((d) => ({ id: d.dispatcherId }));
      }
    } else {
      // по target
      const where: any = { companyId };
      if (dto.target === 'ALL_DRIVERS') where.role = 'DRIVER';
      if (dto.target === 'ALL_DISPATCHERS') where.role = 'DISPATCHER';

      recipients = await this.prisma.user.findMany({
        where,
        select: { id: true },
      });
    }

    // відправляємо кожному в чат
    for (const recipient of recipients) {
      this.messagesGateway.server.to(recipient.id).emit('newAnnouncement', {
        title: announcement.title,
        content: announcement.content,
        createdAt: announcement.createdAt,
      });
    }

    return announcement;
  }

  async findAll(companyId: string | null, userId: string) {
    return this.prisma.announcement.findMany({
      where: companyId
        ? { companyId, createdBy: userId }
        : { createdBy: userId },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        reads: { select: { userId: true, readAt: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(announcementId: string, userId: string) {
    const existing = await this.prisma.announcementRead.findFirst({
      where: { announcementId, userId },
    });
    if (existing) return existing;

    return this.prisma.announcementRead.create({
      data: { announcementId, userId },
    });
  }

  async createDraft(companyId: string, userId: string, dto: CreateDraftDto) {
    return this.prisma.announcementDraft.create({
      data: {
        title: dto.title,
        content: dto.content,
        target: dto.target ?? 'ALL',
        groupId: dto.groupId,
        isTemplate: dto.isTemplate ?? false,
        companyId,
        createdBy: userId,
      },
    });
  }

  async findDrafts(
    companyId: string | null,
    isTemplate: boolean = false,
    userId: string,
  ) {
    const drafts = await this.prisma.announcementDraft.findMany({
      where: companyId
        ? { companyId, isTemplate, createdBy: userId }
        : { isTemplate, createdBy: userId },
      orderBy: { createdAt: 'desc' },
    });
    return drafts;
  }
  async publishDraft(draftId: string, companyId: string, userId: string) {
    const draft = await this.prisma.announcementDraft.findFirst({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException('Чернетка не знайдена');

    const announcement = await this.prisma.announcement.create({
      data: {
        title: draft.title,
        content: draft.content,
        target: draft.target,
        groupId: draft.groupId,
        companyId,
        createdBy: userId,
      },
    });

    if (!draft.isTemplate) {
      await this.prisma.announcementDraft.delete({ where: { id: draftId } });
    }

    return announcement;
  }
  async update(id: string, userId: string, dto: UpdateAnnouncementDto) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id },
      include: {
        group: {
          include: {
            trucks: {
              include: { truck: { select: { currentDriverId: true } } },
            },
            dispatchers: { select: { dispatcherId: true } },
          },
        },
      },
    });
    if (!announcement) throw new NotFoundException('Оголошення не знайдено');

    if (announcement.createdBy !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої оголошення');
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
      },
    });

    let recipients: { id: string }[] = [];

    if (announcement.groupId && announcement.group) {
      console.log('group type:', announcement.group.type);
      if (announcement.group.type === 'TRUCKS') {
        recipients = announcement.group.trucks
          .filter((t) => t.truck.currentDriverId)
          .map((t) => ({ id: t.truck.currentDriverId! }));
      } else if (announcement.group.type === 'DISPATCHERS') {
        recipients = announcement.group.dispatchers.map((d) => ({
          id: d.dispatcherId,
        }));
      }
    } else {
      const where: any = { companyId: announcement.companyId };
      if (announcement.target === 'ALL_DRIVERS') where.role = 'DRIVER';
      if (announcement.target === 'ALL_DISPATCHERS') where.role = 'DISPATCHER';

      console.log('target:', announcement.target);
      console.log('where:', where);

      recipients = await this.prisma.user.findMany({
        where,
        select: { id: true },
      });
    }

    console.log('recipients:', recipients);

    for (const recipient of recipients) {
      console.log('emitting to:', recipient.id);
      this.messagesGateway.server.to(recipient.id).emit('announcementUpdated', {
        id: updated.id,
        title: updated.title,
        content: updated.content,
        updatedAt: new Date(),
      });
    }

    return updated;
  }
  async removeDraft(id: string) {
    const draft = await this.prisma.announcementDraft.findFirst({
      where: { id },
    });
    if (!draft) throw new NotFoundException('Чернетка не знайдена');
    await this.prisma.announcementDraft.delete({ where: { id } });
    return { message: 'Чернетка видалена' };
  }
}

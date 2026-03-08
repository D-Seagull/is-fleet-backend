import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateDraftDto } from './dto/create-draft.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, userId: string, dto: CreateAnnouncementDto) {
    return this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        target: dto.target ?? 'ALL',
        groupId: dto.groupId,
        companyId,
        createdBy: userId,
      },
    });
  }

  async findAll(companyId: string | null) {
    return this.prisma.announcement.findMany({
      where: companyId ? { companyId } : {},
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
    if (!drafts.length) throw new NotFoundException('Чернеток не знайдено');
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

  async removeDraft(id: string) {
    const draft = await this.prisma.announcementDraft.findFirst({
      where: { id },
    });
    if (!draft) throw new NotFoundException('Чернетка не знайдена');
    await this.prisma.announcementDraft.delete({ where: { id } });
    return { message: 'Чернетка видалена' };
  }
}

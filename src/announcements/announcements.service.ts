import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDraftDto } from './dto/create-draft.dto';

/**
 * Broadcast message templates (AnnouncementDraft rows with isTemplate). The
 * announcement feature itself is scoped out — see AnnouncementsController.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  async createDraft(companyId: string, userId: string, dto: CreateDraftDto) {
    return this.prisma.announcementDraft.create({
      data: {
        title: dto.title,
        content: dto.content,
        target: dto.target ?? 'ALL',
        // No group link: a body-supplied groupId could point into another
        // company, and templates never needed one.
        groupId: null,
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

  // Author-only, like the list: a foreign id is just "not found".
  async removeDraft(id: string, userId: string) {
    const draft = await this.prisma.announcementDraft.findFirst({
      where: { id, createdBy: userId },
    });
    if (!draft) throw new NotFoundException('errors.draftNotFound');
    await this.prisma.announcementDraft.delete({ where: { id } });
    return { message: 'Чернетка видалена' };
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { DirectMessagesGateway } from '../direct-messages/direct-messages.gateway';
import { ReactionsService } from '../reactions/reactions.service';

@Injectable()
export class GroupMessageDocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private gateway: DirectMessagesGateway,
    private reactions: ReactionsService,
  ) {}

  async uploadMany(
    uploadedBy: string,
    groupId: string,
    files: Express.Multer.File[],
    replyToMessageId?: string | null,
    replyToDocumentId?: string | null,
    caption?: string | null,
  ) {
    if (!files || files.length === 0) throw new Error('No files provided');

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { managers: true },
    });
    if (!group) throw new NotFoundException('Групу не знайдено');

    // Тільки учасник групи (або її творець) може завантажувати документи.
    const isMember =
      group.createdBy === uploadedBy ||
      group.managers.some((m) => m.managerId === uploadedBy);
    if (!isMember) {
      throw new ForbiddenException('Ви не є учасником цієї групи');
    }

    const created = await Promise.all(
      files.map(async (file) => {
        const isImage = file.mimetype.startsWith('image/');
        const fileType = isImage ? 'PHOTO' : 'DOCUMENT';

        const { storagePath } = await this.storage.uploadFile(file);

        const doc = await this.prisma.groupMessageDocument.create({
          data: {
            groupId,
            uploadedBy,
            fileUrl: storagePath,
            publicId: storagePath,
            fileName: file.originalname,
            fileType,
            replyToMessageId: replyToMessageId ?? null,
            replyToDocumentId: replyToDocumentId ?? null,
            caption: caption?.trim() ? caption.trim() : null,
          },
          include: {
            uploader: { select: { id: true, firstName: true, lastName: true, role: true } },
            group: { select: { id: true, name: true } },
            replyTo: {
              select: {
                id: true,
                content: true,
                deletedAt: true,
                sender: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            replyToDocument: {
              select: {
                id: true,
                fileName: true,
                fileType: true,
                deletedAt: true,
                uploader: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        });

        const signedUrl = await this.storage.getSignedUrl(storagePath, 3600);
        return { ...doc, signedUrl };
      }),
    );

    // Real-time push до всіх учасників group-room
    for (const doc of created) {
      this.gateway.emitNewGroupDocument(groupId, doc);
    }

    return created;
  }

  async findByGroup(groupId: string) {
    const docs = await this.prisma.groupMessageDocument.findMany({
      where: { groupId },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true, role: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            sender: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        replyToDocument: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            deletedAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const reactionsByDoc = await this.reactions.getForMessages(
      'GROUP_DOC',
      docs.map((d) => d.id),
    );
    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        signedUrl: d.deletedAt
          ? ''
          : await this.storage.getSignedUrl(d.fileUrl, 3600),
        reactions: reactionsByDoc[d.id] ?? [],
      })),
    );
  }

  async view(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.groupMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Документ не знайдений');
    const url = await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { url };
  }

  async download(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.groupMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Документ не знайдений');
    const url = await this.storage.getSignedUrl(
      doc.fileUrl,
      3600,
      doc.fileName,
    );
    return { url };
  }

  async remove(id: string, userId: string) {
    const doc = await this.prisma.groupMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Документ не знайдений');

    // Тільки той, хто завантажив, може видалити.
    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('Ви не можете видалити цей документ');
    }
    if (doc.deletedAt) {
      return { id: doc.id };
    }

    if (doc.fileUrl) {
      try {
        await this.storage.deleteFile(doc.fileUrl);
      } catch {
        // ignore — proceed with soft delete
      }
    }

    await this.prisma.groupMessageDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.gateway.emitGroupDocumentDeleted(doc.groupId, doc.id);
    return { id: doc.id };
  }
}

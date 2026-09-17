import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    if (!group) throw new NotFoundException('errors.groupNotFound');

    // Тільки учасник групи (або її творець) може завантажувати документи.
    // For the company-wide DRIVERS group membership is implicit — anyone in
    // the same company (i.e. its drivers) counts, since there are no
    // GroupManager/GroupTruck rows tying them to it.
    let isMember =
      group.createdBy === uploadedBy ||
      group.managers.some((m) => m.managerId === uploadedBy);
    if (!isMember && group.type === 'DRIVERS') {
      const uploader = await this.prisma.user.findUnique({
        where: { id: uploadedBy },
        select: { companyId: true },
      });
      isMember = !!uploader && uploader.companyId === group.companyId;
    }
    if (!isMember) {
      throw new ForbiddenException('errors.notGroupMember');
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
            uploader: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                status: true,
                statusUntil: true,
                role: true,
              },
            },
            group: { select: { id: true, name: true } },
            replyTo: {
              select: {
                id: true,
                content: true,
                deletedAt: true,
                sender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                  },
                },
              },
            },
            replyToDocument: {
              select: {
                id: true,
                fileName: true,
                fileType: true,
                deletedAt: true,
                uploader: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                  },
                },
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
    // Docs + reactions in parallel.
    const [docs, reactionRows] = await Promise.all([
      this.prisma.groupMessageDocument.findMany({
        where: { groupId },
        include: {
          uploader: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              status: true,
              statusUntil: true,
              role: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              deletedAt: true,
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
          replyToDocument: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              deletedAt: true,
              uploader: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.$queryRaw<
        Array<{ id: string; targetId: string; userId: string; emoji: string }>
      >(Prisma.sql`
        SELECT id, "targetId", "userId", emoji
        FROM "MessageReaction"
        WHERE "targetType" = 'GROUP_DOC'
          AND "targetId" IN (SELECT id FROM "GroupMessageDocument" WHERE "groupId" = ${groupId})
      `),
    ]);

    const reactionsByDoc = new Map<
      string,
      Array<{ id: string; userId: string; emoji: string }>
    >();
    for (const r of reactionRows) {
      let arr = reactionsByDoc.get(r.targetId);
      if (!arr) {
        arr = [];
        reactionsByDoc.set(r.targetId, arr);
      }
      arr.push({ id: r.id, userId: r.userId, emoji: r.emoji });
    }

    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        ...(await this.signOrHeal(d)),
        reactions: reactionsByDoc.get(d.id) ?? [],
      })),
    );
  }

  private readonly logger = new Logger(GroupMessageDocumentsService.name);

  /**
   * Signed URL for a list row — and a repair when the file turns out to be
   * gone.
   *
   * A file deleted straight from the Supabase bucket leaves `deletedAt` null,
   * so the row goes on claiming a file that no longer exists. Storage has just
   * told us otherwise, so record it: every client already renders `deletedAt`
   * as a "file deleted" tombstone, which is exactly what this is. Without the
   * write the ghost would come back on every single read.
   *
   * Only ever reached when storage explicitly reported the object missing —
   * an unreachable bucket throws further up and never lands here, so an
   * outage cannot mass-delete anything.
   *
   * The write is fire-and-forget: the response already carries the corrected
   * value, and a failed repair just means we try again on the next read.
   */
  private async signOrHeal(doc: {
    id: string;
    fileUrl: string;
    deletedAt?: Date | null;
  }): Promise<{ deletedAt: Date | null; signedUrl: string }> {
    if (doc.deletedAt) return { deletedAt: doc.deletedAt, signedUrl: '' };

    const url = await this.storage.getSignedUrlOrNull(doc.fileUrl, 3600);
    if (url) return { deletedAt: null, signedUrl: url };

    const deletedAt = new Date();
    this.logger.warn(
      `Marking groupMessageDocument ${doc.id} deleted — file gone from storage: ${doc.fileUrl}`,
    );
    void this.prisma.groupMessageDocument
      .update({ where: { id: doc.id }, data: { deletedAt } })
      .catch(() => undefined);
    return { deletedAt, signedUrl: '' };
  }

  async view(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.groupMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('errors.documentNotFound');
    const url = await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { url };
  }

  async download(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.groupMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('errors.documentNotFound');
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
    if (!doc) throw new NotFoundException('errors.documentNotFound');

    // Тільки той, хто завантажив, може видалити.
    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('errors.cannotDeleteDocument');
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

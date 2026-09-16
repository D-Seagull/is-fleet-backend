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
export class DirectMessageDocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private gateway: DirectMessagesGateway,
    private reactions: ReactionsService,
  ) {}

  async uploadMany(
    uploadedBy: string,
    otherUserId: string,
    files: Express.Multer.File[],
    replyToMessageId?: string | null,
    replyToDocumentId?: string | null,
    caption?: string | null,
  ) {
    if (!files || files.length === 0) throw new Error('No files provided');

    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId },
    });
    if (!otherUser) throw new NotFoundException('errors.userNotFound');

    const created = await Promise.all(
      files.map(async (file) => {
        const isImage = file.mimetype.startsWith('image/');
        const fileType = isImage ? 'PHOTO' : 'DOCUMENT';

        const { storagePath } = await this.storage.uploadFile(file);

        const doc = await this.prisma.directMessageDocument.create({
          data: {
            uploadedBy,
            otherUserId,
            fileUrl: storagePath,
            publicId: storagePath,
            fileName: file.originalname,
            fileType,
            replyToMessageId: replyToMessageId ?? null,
            replyToDocumentId: replyToDocumentId ?? null,
            // Caption — same text for every file in this upload batch. Empty
            // strings get normalised to null so the bubble doesn't render a
            // blank caption row.
            caption: caption?.trim() ? caption.trim() : null,
          },
          include: {
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
            otherUser: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
            replyTo: {
              select: {
                id: true,
                content: true,
                deletedAt: true,
                sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
              },
            },
            replyToDocument: {
              select: {
                id: true,
                fileName: true,
                fileType: true,
                deletedAt: true,
                uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
              },
            },
          },
        });

        const signedUrl = await this.storage.getSignedUrl(storagePath, 3600);
        return { ...doc, signedUrl };
      }),
    );

    // Real-time push: обом учасникам у DM-room
    for (const doc of created) {
      this.gateway.emitNewDirectDocument(uploadedBy, otherUserId, doc);
    }

    return created;
  }

  async findByConversation(meId: string, otherUserId: string) {
    // Docs + reactions in parallel. Reactions subquery filters to the same
    // conversation via the same OR clause.
    const [docs, reactionRows] = await Promise.all([
      this.prisma.directMessageDocument.findMany({
        where: {
          OR: [
            { uploadedBy: meId, otherUserId: otherUserId },
            { uploadedBy: otherUserId, otherUserId: meId },
          ],
        },
        include: {
          uploader: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
          replyTo: {
            select: {
              id: true,
              content: true,
              deletedAt: true,
              sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            },
          },
          replyToDocument: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              deletedAt: true,
              uploader: { select: { id: true, firstName: true, lastName: true, avatar: true } },
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
        WHERE "targetType" = 'DM_DOC'
          AND "targetId" IN (
            SELECT id FROM "DirectMessageDocument"
            WHERE ("uploadedBy" = ${meId} AND "otherUserId" = ${otherUserId})
               OR ("uploadedBy" = ${otherUserId} AND "otherUserId" = ${meId})
          )
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

  private readonly logger = new Logger(DirectMessageDocumentsService.name);

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
      `Marking directMessageDocument ${doc.id} deleted — file gone from storage: ${doc.fileUrl}`,
    );
    void this.prisma.directMessageDocument
      .update({ where: { id: doc.id }, data: { deletedAt } })
      .catch(() => undefined);
    return { deletedAt, signedUrl: '' };
  }

  async view(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.directMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('errors.documentNotFound');
    const url = await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { url };
  }

  async download(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.directMessageDocument.findUnique({
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
    const doc = await this.prisma.directMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('errors.documentNotFound');

    // Тільки той, хто завантажив, може видалити (як домовились).
    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('errors.cannotDeleteDocument');
    }
    if (doc.deletedAt) {
      // Already deleted — idempotent.
      return { id: doc.id };
    }

    // Free the storage but keep the row so the chat shows a tombstone.
    if (doc.fileUrl) {
      try {
        await this.storage.deleteFile(doc.fileUrl);
      } catch {
        // Storage may have been cleaned up already — soft delete should still proceed.
      }
    }

    await this.prisma.directMessageDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.gateway.emitDirectDocumentDeleted(
      doc.uploadedBy,
      doc.otherUserId,
      doc.id,
    );
    return { id: doc.id };
  }
}

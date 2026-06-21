import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { ReactionsService } from '../reactions/reactions.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private gateway: MessagesGateway,
    private reactions: ReactionsService,
  ) {}

  async uploadMany(
    tripId: string,
    uploadedBy: string,
    files: Express.Multer.File[],
    replyToMessageId?: string | null,
    replyToDocumentId?: string | null,
    caption?: string | null,
  ) {
    if (!files || files.length === 0) throw new Error('No files provided');

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

    const created = await Promise.all(
      files.map(async (file) => {
        const isImage = file.mimetype.startsWith('image/');
        const fileType = isImage ? 'PHOTO' : 'DOCUMENT';

        const { storagePath } = await this.storage.uploadFile(file);

        const doc = await this.prisma.tripDocument.create({
          data: {
            tripId,
            fileUrl: storagePath,
            publicId: storagePath,
            fileName: file.originalname,
            uploadedBy,
            fileType,
            replyToMessageId: replyToMessageId ?? null,
            replyToDocumentId: replyToDocumentId ?? null,
            caption: caption?.trim() ? caption.trim() : null,
          },
          include: {
            uploader: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
            trip: {
              select: {
                id: true,
                title: true,
                orderNumber: true,
                truck: { select: { id: true, plate: true } },
              },
            },
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

    // Real-time push to everyone in the trip room — manager web + driver
    // app see the doc appear in chat without refetching.
    for (const doc of created) {
      this.gateway.emitNewDocument(tripId, doc);
    }

    return created;
  }

  async remove(id: string, userId: string, userRole: string) {
    const document = await this.prisma.tripDocument.findUnique({
      where: { id },
    });
    if (!document) throw new NotFoundException('Документ не знайдений');

    // Drivers can only delete their own uploads; managers can delete anything.
    const isManager = ['ADMIN', 'TEAMLEAD', 'MANAGER'].includes(userRole);
    if (!isManager && document.uploadedBy !== userId) {
      throw new ForbiddenException('Ви не можете видалити цей документ');
    }
    if (document.deletedAt) {
      return { id: document.id };
    }

    // Free the storage but keep the row so chat shows a "File deleted"
    // tombstone (mirrors message soft-delete behaviour).
    if (document.fileUrl) {
      try {
        await this.storage.deleteFile(document.fileUrl);
      } catch {
        // ignore — proceed with soft delete
      }
    }

    await this.prisma.tripDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.gateway.emitDocumentDeleted(document.tripId, document.id);
    return { id: document.id };
  }

  async view(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.tripDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не знайдений');
    const url = await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { url };
  }

  async download(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.tripDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не знайдений');
    const url = await this.storage.getSignedUrl(doc.fileUrl, 3600, doc.fileName);
    return { url };
  }

  private async withSignedUrl<T extends { fileUrl: string; deletedAt?: Date | null }>(
    doc: T,
  ) {
    const signedUrl = doc.deletedAt
      ? ''
      : await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { ...doc, signedUrl };
  }

  async findByTrip(tripId: string) {
    // Docs query + reactions subquery in parallel — same wall-time gain
    // as the message endpoints. Reactions subquery filters by tripId so
    // it returns only the relevant rows.
    const [docs, reactionRows] = await Promise.all([
      this.prisma.tripDocument.findMany({
        where: { tripId },
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
        WHERE "targetType" = 'TRIP_DOC'
          AND "targetId" IN (SELECT id FROM "TripDocument" WHERE "tripId" = ${tripId})
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
        ...(await this.withSignedUrl(d)),
        reactions: reactionsByDoc.get(d.id) ?? [],
      })),
    );
  }

  async findByTruck(truckId: string) {
    const docs = await this.prisma.tripDocument.findMany({
      where: { trip: { truckId } },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        trip: { select: { id: true, title: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(docs.map((d) => this.withSignedUrl(d)));
  }

  // All documents within a company. Used by the manager web UI to show a
  // single "all my docs" page grouped by trip.
  async findByCompany(companyId: string) {
    const docs = await this.prisma.tripDocument.findMany({
      where: { trip: { companyId } },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        trip: {
          select: {
            id: true,
            title: true,
            orderNumber: true,
            truck: { select: { id: true, plate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(docs.map((d) => this.withSignedUrl(d)));
  }
}

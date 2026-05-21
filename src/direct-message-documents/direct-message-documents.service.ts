import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';
import { DirectMessagesGateway } from '../direct-messages/direct-messages.gateway';

@Injectable()
export class DirectMessageDocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private gateway: DirectMessagesGateway,
  ) {}

  async uploadMany(
    uploadedBy: string,
    otherUserId: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) throw new Error('No files provided');

    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId },
    });
    if (!otherUser) throw new NotFoundException('Користувача не знайдено');

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
          },
          include: {
            uploader: { select: { id: true, name: true, role: true } },
            otherUser: { select: { id: true, name: true, role: true } },
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
    const docs = await this.prisma.directMessageDocument.findMany({
      where: {
        OR: [
          { uploadedBy: meId, otherUserId: otherUserId },
          { uploadedBy: otherUserId, otherUserId: meId },
        ],
      },
      include: {
        uploader: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      docs.map(async (d) => ({
        ...d,
        signedUrl: await this.storage.getSignedUrl(d.fileUrl, 3600),
      })),
    );
  }

  async view(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.directMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Документ не знайдений');
    const url = await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { url };
  }

  async download(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.directMessageDocument.findUnique({
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
    const doc = await this.prisma.directMessageDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Документ не знайдений');

    // Тільки той, хто завантажив, може видалити (як домовились).
    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('Ви не можете видалити цей документ');
    }

    if (doc.fileUrl) {
      await this.storage.deleteFile(doc.fileUrl);
    }

    await this.prisma.directMessageDocument.delete({ where: { id } });
    this.gateway.emitDirectDocumentDeleted(
      doc.uploadedBy,
      doc.otherUserId,
      doc.id,
    );
    return { message: `Документ ${doc.fileName} видалений` };
  }
}

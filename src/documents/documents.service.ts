import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  async uploadMany(
    tripId: string,
    uploadedBy: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) throw new Error('No files provided');

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

    return Promise.all(
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
          },
          include: {
            uploader: { select: { id: true, name: true, role: true } },
          },
        });

        const signedUrl = await this.storage.getSignedUrl(storagePath, 3600);
        return { ...doc, signedUrl };
      }),
    );
  }

  async remove(id: string) {
    const document = await this.prisma.tripDocument.findUnique({
      where: { id },
    });
    if (!document) throw new NotFoundException('Документ не знайдений');

    // fileUrl тепер = storagePath у Supabase bucket
    if (document.fileUrl) {
      await this.storage.deleteFile(document.fileUrl);
    }

    await this.prisma.tripDocument.delete({ where: { id } });
    return { message: `Документ ${document.fileName} видалений` };
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

  private async withSignedUrl<T extends { fileUrl: string }>(doc: T) {
    const signedUrl = await this.storage.getSignedUrl(doc.fileUrl, 3600);
    return { ...doc, signedUrl };
  }

  async findByTrip(tripId: string) {
    const docs = await this.prisma.tripDocument.findMany({
      where: { tripId },
      include: { uploader: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(docs.map((d) => this.withSignedUrl(d)));
  }

  async findByTruck(truckId: string) {
    const docs = await this.prisma.tripDocument.findMany({
      where: { trip: { truckId } },
      include: {
        uploader: { select: { id: true, name: true, role: true } },
        trip: { select: { id: true, title: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(docs.map((d) => this.withSignedUrl(d)));
  }
}

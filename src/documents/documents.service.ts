import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
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

        const { url, publicId } = await this.cloudinary.uploadFile(file);

        return this.prisma.tripDocument.create({
          data: {
            tripId,
            fileUrl: url,
            publicId,
            fileName: file.originalname,
            uploadedBy,
            fileType,
          },
          include: {
            uploader: { select: { id: true, name: true, role: true } },
          },
        });
      }),
    );
  }

  async remove(id: string) {
    const document = await this.prisma.tripDocument.findUnique({
      where: { id },
    });
    if (!document) throw new NotFoundException('Документ не знайдений');

    if (document.publicId) {
      const resourceType = document.fileType === 'PHOTO' ? 'image' : 'raw';
      await this.cloudinary.deleteFile(document.publicId, resourceType);
    }

    await this.prisma.tripDocument.delete({ where: { id } });
    return { message: `Документ ${document.fileName} видалений` };
  }

  async findByTrip(tripId: string) {
    return this.prisma.tripDocument.findMany({
      where: { tripId },
      include: { uploader: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async proxyFile(
    id: string,
    res: Response,
    disposition: 'attachment' | 'inline',
  ): Promise<void> {
    const doc = await this.prisma.tripDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не знайдений');

    // Нормалізуємо URL: деякі Cloudinary SDK повертають /image/upload/ для raw-ресурсів
    const fileUrl = doc.fileType === 'DOCUMENT'
      ? doc.fileUrl.replace('/image/upload/', '/raw/upload/')
      : doc.fileUrl;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new NotFoundException(`Не вдалося отримати файл: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

    // Визначаємо розширення файлу
    let fileName = doc.fileName;
    if (!/\.[a-z0-9]{2,5}$/i.test(fileName)) {
      // 1. Спробуємо з URL Cloudinary
      const urlPart = fileUrl.split('/').pop()?.split('?')[0] ?? '';
      const extFromUrl = urlPart.match(/(\.[a-z0-9]{2,5})$/i)?.[1];
      // 2. Або з Content-Type відповіді
      const MIME_EXT: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
      };
      const mimeBase = contentType.split(';')[0].trim();
      const extFromMime = MIME_EXT[mimeBase];
      fileName += extFromUrl ?? extFromMime ?? '';
    }
    const encodedName = encodeURIComponent(fileName);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition':
        disposition === 'attachment'
          ? `attachment; filename*=UTF-8''${encodedName}`
          : `inline; filename*=UTF-8''${encodedName}`,
    });

    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(response.body as any);
    nodeStream.pipe(res);
  }

  async view(id: string, res: Response): Promise<void> {
    return this.proxyFile(id, res, 'inline');
  }

  async download(id: string, res: Response): Promise<void> {
    return this.proxyFile(id, res, 'attachment');
  }

  async findByTruck(truckId: string) {
    return this.prisma.tripDocument.findMany({
      where: { trip: { truckId } },
      include: {
        uploader: { select: { id: true, name: true, role: true } },
        trip: { select: { id: true, title: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

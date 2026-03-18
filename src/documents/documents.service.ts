import { Injectable, NotFoundException } from '@nestjs/common';
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
        const { url, publicId } = await this.cloudinary.uploadFile(file);
        return this.prisma.tripDocument.create({
          data: {
            tripId,
            fileUrl: url,
            publicId,
            fileName: file.originalname,
            uploadedBy,
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
      await this.cloudinary.deleteFile(document.publicId as string);
    }

    await this.prisma.tripDocument.delete({ where: { id } });
    return { message: `Документ ${document.fileName} видалений` };
  }

  async findByTrip(tripId: string) {
    return this.prisma.tripDocument.findMany({
      where: { tripId },
      include: { uploader: { select: { id: true, name: true, role: true } } },
    });
  }
}

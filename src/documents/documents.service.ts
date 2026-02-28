import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async upload(tripId: string, uploadedBy: string, file: Express.Multer.File) {
    if (!file) throw new Error('No file provided');

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Рейс не знайдений');

    const fileUrl = await this.cloudinary.uploadFile(file);

    return this.prisma.tripDocument.create({
      data: {
        tripId,
        fileUrl,
        fileName: file.originalname,
        uploadedBy,
      },
    });
  }

  async findByTrip(tripId: string) {
    return this.prisma.tripDocument.findMany({
      where: { tripId },
      include: { uploader: { select: { id: true, name: true, role: true } } },
    });
  }

  async remove(id: string) {
    const document = await this.prisma.tripDocument.findUnique({
      where: { id },
    });
    if (!document) throw new NotFoundException('Документ не знайдений');

    await this.prisma.tripDocument.delete({ where: { id } });

    return { message: `Документ ${document.fileName} видалений` };
  }
}

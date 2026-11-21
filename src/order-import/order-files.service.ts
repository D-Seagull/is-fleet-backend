import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../supabase-storage/supabase-storage.service';
import { assertTripAccess, type Requester } from '../common/utils/access';

const ORDER_FILE_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  storagePath: true,
} as const;

/**
 * The trip's order file. Managers only — the controller's @Roles keeps
 * DRIVER out, and no trip query includes `orderFiles`, so the file never
 * rides along in what a driver loads (see order-files.spec.ts).
 */
@Injectable()
export class OrderFilesService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  async upload(
    tripId: string,
    requester: Requester,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('errors.fileRequired');
    await assertTripAccess(this.prisma, tripId, requester);

    const { storagePath } = await this.storage.uploadFile(file, 'orders');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.tripOrderFile.updateMany({
        where: { tripId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return tx.tripOrderFile.create({
        data: {
          tripId,
          storagePath,
          // uploadFile turned an iPhone HEIC into JPEG: name/type follow it.
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.buffer.length,
          uploadedById: requester.id,
        },
        select: ORDER_FILE_SELECT,
      });
    });
    return this.withUrl(row);
  }

  /** The current order file with a 1-hour link, or null when there is none. */
  async current(tripId: string, requester: Requester) {
    await assertTripAccess(this.prisma, tripId, requester);
    const row = await this.prisma.tripOrderFile.findFirst({
      where: { tripId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: ORDER_FILE_SELECT,
    });
    return row ? this.withUrl(row) : null;
  }

  async remove(tripId: string, requester: Requester) {
    await assertTripAccess(this.prisma, tripId, requester);
    await this.prisma.tripOrderFile.updateMany({
      where: { tripId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  private async withUrl(row: {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: Date;
    storagePath: string;
  }) {
    const { storagePath, ...rest } = row;
    return {
      ...rest,
      url: await this.storage.getSignedUrlOrNull(storagePath),
    };
  }
}

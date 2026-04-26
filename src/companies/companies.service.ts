import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseStorageService } from 'src/supabase-storage/supabase-storage.service';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  async getCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Компанія не знайдена');
    return company;
  }

  async uploadLogo(companyId: string, file: Express.Multer.File) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
    });

    if (company?.logoPublicId) {
      await this.storage.deleteFile(company.logoPublicId as string);
    }

    const { url, storagePath } = await this.storage.uploadWithUrl(file, 'logos');

    return this.prisma.company.update({
      where: { id: companyId },
      data: { logo: url, logoPublicId: storagePath },
    });
  }

  async updateLogo(companyId: string, file: Express.Multer.File) {
    return this.uploadLogo(companyId, file);
  }

  async deleteLogo(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
    });

    if (company?.logoPublicId) {
      await this.storage.deleteFile(company.logoPublicId as string);
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: { logo: null, logoPublicId: null },
    });
  }
  async updateEmails(
    companyId: string,
    dto: {
      accountingEmail?: string;
      hrEmail?: string;
      directorEmail?: string;
    },
  ) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }
}

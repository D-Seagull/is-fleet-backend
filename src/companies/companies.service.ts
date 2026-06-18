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

  /**
   * General profile patch: name + the three contact emails. Empty strings
   * are normalised to null so cleared fields don't blow up the schema's
   * `String?` columns. Used by Settings (TEAMLEAD only).
   */
  async updateCompany(
    companyId: string,
    dto: {
      name?: string;
      accountingEmail?: string | null;
      hrEmail?: string | null;
      directorEmail?: string | null;
    },
  ) {
    const normEmail = (v: string | null | undefined) =>
      v === undefined ? undefined : v && v.length > 0 ? v : null;

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        accountingEmail: normEmail(dto.accountingEmail),
        hrEmail: normEmail(dto.hrEmail),
        directorEmail: normEmail(dto.directorEmail),
      },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
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

    // видаляємо старе лого з Cloudinary
    if (company?.logoPublicId) {
      await this.cloudinary.deleteFile(company.logoPublicId as string);
    }

    const { url, publicId } = await this.cloudinary.uploadFile(file);

    return this.prisma.company.update({
      where: { id: companyId },
      data: { logo: url, logoPublicId: publicId },
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
      await this.cloudinary.deleteFile(company.logoPublicId as string);
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

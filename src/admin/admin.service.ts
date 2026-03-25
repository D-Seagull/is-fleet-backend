import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const inviteToken = uuidv4();
    const inviteExpiry = new Date();
    // inviteExpiry.setDate(inviteExpiry.getDate() + 7); // токен дійсний 7 днів

    const existing = await this.prisma.company.findFirst({
      where: {
        name: dto.name,
      },
    });

    if (existing)
      throw new BadRequestException('Company with this name already created');

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        inviteToken,
        inviteExpiry,
      },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/auth/register?token=${inviteToken}`;

    await this.mail.sendInvite(dto.email, dto.name, inviteLink);

    return {
      company,
      inviteLink,
    };
  }

  async findAllCompanies() {
    return this.prisma.company.findMany({
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });
  }

  async deactivateCompany(id: string) {
    return this.prisma.company.update({
      where: { id },
      data: { isActive: false },
    });
  }
  // admin.service.ts
  async resendInvite(id: string, email: string) {
    const company = await this.prisma.company.findFirst({ where: { id } });
    if (!company) throw new NotFoundException('Компанія не знайдена');

    const inviteLink = `${process.env.FRONTEND_URL}/auth/register?token=${company.inviteToken}`;
    await this.mail.sendInvite(email, company.name, inviteLink);

    return { message: 'Invite відправлено!' };
  }
}

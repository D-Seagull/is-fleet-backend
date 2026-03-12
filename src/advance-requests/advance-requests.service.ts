import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { CreateAdvanceRequestDto } from './dto/create-advance-request.dto';

@Injectable()
export class AdvanceRequestsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  async create(
    driverId: string,
    companyId: string,
    dto: CreateAdvanceRequestDto,
  ) {
    // знаходимо водія з диспетчером і тімлідом
    const driver = await this.prisma.user.findFirst({
      where: { id: driverId },
      include: {
        dispatcher: {
          select: {
            email: true,
            teamlead: { select: { email: true } },
          },
        },
      },
    });

    if (!driver) throw new NotFoundException('Водій не знайдений');

    // зберігаємо заявку
    const request = await this.prisma.advanceRequest.create({
      data: {
        driverId,
        companyId,
        amount: dto.amount,
        reason: dto.reason,
      },
    });

    // email диспетчера як from
    const fromEmail: string =
      driver.dispatcher?.email ?? this.config.get<string>('MAIL_FROM')!;

    // бухгалтерія
    const toEmail: string = this.config.get<string>('ACCOUNTING_EMAIL')!;

    // якщо сума > 200€ — тімлід в копії
    const ccEmail: string | null =
      dto.amount > 200 ? (driver.dispatcher?.teamlead?.email ?? null) : null;

    await this.mail.sendAdvanceRequest(
      fromEmail,
      toEmail,
      ccEmail,
      driver.name,
      dto.amount,
      dto.reason,
    );

    return request;
  }

  async findMyRequests(userId: string, role: string) {
    if (role === 'DRIVER') {
      return await this.prisma.advanceRequest.findMany({
        where: { driverId: userId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === 'DISPATCHER') {
      return await this.prisma.advanceRequest.findMany({
        where: {
          driver: { dispatcherId: userId },
        },
        include: {
          driver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === 'TEAMLEAD') {
      return await this.prisma.advanceRequest.findMany({
        where: {
          driver: { dispatcher: { teamleadId: userId } },
        },
        include: {
          driver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // ADMIN - всі заявки
    return await this.prisma.advanceRequest.findMany({
      include: {
        driver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

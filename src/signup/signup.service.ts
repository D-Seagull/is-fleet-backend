import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { TrialSignupDto } from './dto/trial-signup.dto';
import { DemoRequestDto } from './dto/demo-request.dto';

/** How long the self-serve invite link stays valid — same as an admin-created company. */
const INVITE_DAYS = 7;

/**
 * Self-serve entry points from the public landing page.
 *
 * "Start free trial" reuses the admin flow without the admin: it creates the company with an
 * invite token and mails the register link to the address given. Clicking that link is what
 * proves the address, and the first person to register through it becomes the TEAMLEAD — exactly
 * as when an admin creates the company. There is no time limit on these companies yet.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async startTrial(dto: TrialSignupDto) {
    // A filled honeypot is a bot: answer like a success so it learns nothing.
    if (dto.website) return { ok: true };

    // Already has an account: don't create anything and don't say so in the response
    // (no account enumeration) — tell the owner of the address by mail instead.
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (user) {
      await this.mail.sendTrialExistingAccount(dto.email, this.loginUrl());
      return { ok: true };
    }

    const taken = await this.prisma.company.findFirst({
      where: { name: { equals: dto.companyName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('errors.companyExists');

    const inviteToken = randomUUID();
    const inviteExpiry = new Date();
    inviteExpiry.setDate(inviteExpiry.getDate() + INVITE_DAYS);

    const company = await this.prisma.company.create({
      data: { name: dto.companyName, inviteToken, inviteExpiry },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;
    try {
      await this.mail.sendTrialInvite(
        dto.email,
        dto.name,
        dto.companyName,
        inviteLink,
      );
    } catch {
      // Without the mail nobody can ever claim the company — roll it back so the
      // visitor can simply try again.
      await this.prisma.company.delete({ where: { id: company.id } });
      throw new ServiceUnavailableException('errors.mailFailed');
    }

    await this.notifySales(
      'New self-serve trial',
      {
        Company: dto.companyName,
        Name: dto.name,
        Email: dto.email,
        Trucks: dto.trucks,
      },
      dto.email,
    );

    return { ok: true };
  }

  async requestDemo(dto: DemoRequestDto) {
    if (dto.website) return { ok: true };

    try {
      await this.mail.sendSalesNotification(
        `Demo request — ${dto.company}`,
        {
          Name: dto.name,
          Company: dto.company,
          Email: dto.email,
          Trucks: dto.trucks,
          Message: dto.message,
        },
        dto.email,
      );
    } catch {
      throw new ServiceUnavailableException('errors.mailFailed');
    }

    // The request already reached us; a failed confirmation must not turn it into an error.
    await this.mail
      .sendDemoConfirmation(dto.email, dto.name)
      .catch((e: Error) =>
        this.logger.warn(`Demo confirmation not sent: ${e.message}`),
      );

    return { ok: true };
  }

  private loginUrl() {
    return `${process.env.FRONTEND_URL}/login`;
  }

  /** Heads-up to the sales inbox; never fails the visitor's request. */
  private async notifySales(
    subject: string,
    fields: Record<string, string | undefined>,
    replyTo: string,
  ) {
    await this.mail
      .sendSalesNotification(subject, fields, replyTo)
      .catch((e: Error) =>
        this.logger.warn(`Sales notification not sent: ${e.message}`),
      );
  }
}

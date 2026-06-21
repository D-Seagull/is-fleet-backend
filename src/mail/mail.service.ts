import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Transactional mail via Resend's SMTP relay. We stayed on nodemailer
 * instead of reaching for the `resend` SDK so the API surface (sendMail
 * with from/to/cc/replyTo/html) and any future provider switch stay one
 * config-line away.
 *
 * Env:
 *   RESEND_API_KEY — issued in the Resend dashboard. Used as the SMTP
 *                    password; the username is the literal "resend".
 *   MAIL_FROM      — verified sender address. Defaults to Resend's
 *                    sandbox so the service still boots on a fresh
 *                    environment that hasn't added a domain yet.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY is not set — outbound mail will fail until it is configured.',
      );
    }
    this.fromAddress =
      this.config.get<string>('MAIL_FROM') ?? 'onboarding@resend.dev';

    this.transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: apiKey ?? '',
      },
    });
  }

  async sendAdvanceRequest(
    from: string,
    to: string,
    cc: string | null,
    driverName: string,
    amount: number,
    reason: string,
  ) {
    await this.transporter.sendMail({
      from: `"IS Fleet" <${this.fromAddress}>`,
      to,
      cc: cc ?? undefined,
      replyTo: from,
      subject: driverName,
      html: `
        <p><b>driver:</b> ${driverName}</p>
        <p><b>amount:</b> ${amount} €</p>
        <p><b>reason:</b> ${reason}</p>
      `,
    });
  }

  async sendCompanyInvite(to: string, companyName: string, inviteLink: string) {
    await this.transporter.sendMail({
      from: `"IS Fleet" <${this.fromAddress}>`,
      to,
      subject: `Запрошення до IS Fleet — ${companyName}`,
      html: `
        <h2>Вітаємо!</h2>
        <p>Вашу компанію <b>${companyName}</b> було зареєстровано в IS Fleet.</p>
        <p>Перейдіть по посиланню щоб зареєструватись:</p>
        <a href="${inviteLink}">${inviteLink}</a>
      `,
    });
  }

  async sendManagerInvite(to: string, inviteLink: string) {
    await this.transporter.sendMail({
      from: `"IS Fleet" <${this.fromAddress}>`,
      to,
      subject: 'Запрошення до IS Fleet',
      html: `
        <h2>Вітаємо!</h2>
        <p>Вас запросили до системи IS Fleet як менеджера.</p>
        <p>Перейдіть по посиланню щоб зареєструватись:</p>
        <a href="${inviteLink}">${inviteLink}</a>
      `,
    });
  }
}

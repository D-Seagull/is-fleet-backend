import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  // Sender must be on a Resend-verified domain (isfleet.eu). Overridable via
  // MAIL_FROM, e.g. "IS Fleet <noreply@isfleet.eu>".
  private readonly from: string;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.from =
      this.config.get<string>('MAIL_FROM') ?? 'IS Fleet <noreply@isfleet.eu>';
  }

  // Resend returns { data, error } instead of throwing — normalise to a throw
  // so callers keep the old nodemailer failure semantics.
  private async send(opts: {
    to: string;
    subject: string;
    html: string;
    cc?: string;
    replyTo?: string;
  }) {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: opts.to,
      cc: opts.cc,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      this.logger.error(
        `Email send failed (${opts.subject}): ${error.message}`,
      );
      throw new Error(error.message);
    }
  }

  async sendAdvanceRequest(
    from: string,
    to: string,
    cc: string | null,
    driverName: string,
    amount: number,
    reason: string,
  ) {
    await this.send({
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
    await this.send({
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
    await this.send({
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

  async sendPasswordReset(to: string, resetLink: string) {
    await this.send({
      to,
      subject: 'Скидання паролю IS Fleet',
      html: `
        <h2>Скидання паролю</h2>
        <p>Ви отримали цей лист, тому що надійшов запит на скидання паролю для вашого акаунта IS Fleet.</p>
        <p>Перейдіть по посиланню, щоб задати новий пароль. Посилання дійсне протягом 1 години:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Якщо ви не запитували скидання — просто проігноруйте цей лист.</p>
      `,
    });
  }
}

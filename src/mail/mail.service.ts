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

  // ── Landing page (public forms) ─────────────────────────────────────────
  // English, like the landing page. Everything a visitor typed goes through esc().

  /** Self-serve trial: the link that claims the new company (first sign-up becomes TEAMLEAD). */
  async sendTrialInvite(
    to: string,
    name: string,
    companyName: string,
    inviteLink: string,
  ) {
    await this.send({
      to,
      subject: oneLine(`Your IS Fleet workspace for ${companyName}`),
      html: `
        <h2>Welcome to IS Fleet, ${esc(name)}!</h2>
        <p>Your workspace for <b>${esc(companyName)}</b> is ready.</p>
        <p>Open this link to set your password and sign in. It is valid for 7 days:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
        <p>Once you're in, you can add your trucks, managers and drivers.</p>
        <p>If you didn't ask for this, just ignore this email.</p>
      `,
    });
  }

  /** A trial was requested for an address that already has an account. */
  async sendTrialExistingAccount(to: string, loginLink: string) {
    await this.send({
      to,
      subject: 'You already have an IS Fleet account',
      html: `
        <p>Someone (probably you) tried to start an IS Fleet trial with this email address,
        but it already belongs to an account.</p>
        <p>Sign in here: <a href="${loginLink}">${loginLink}</a></p>
        <p>Forgot your password? Use "Forgot password" on the sign-in page.</p>
      `,
    });
  }

  /** Demo request received — confirmation to the visitor. */
  async sendDemoConfirmation(to: string, name: string) {
    await this.send({
      to,
      subject: 'We got your IS Fleet demo request',
      html: `
        <p>Hi ${esc(name)},</p>
        <p>Thanks for your interest in IS Fleet. We'll get back to you shortly to set up a demo
        on your own routes.</p>
        <p>— The IS Fleet team</p>
      `,
    });
  }

  /** Lead or sign-up for the sales inbox (SALES_EMAIL); "reply" goes straight to the visitor. */
  async sendSalesNotification(
    subject: string,
    fields: Record<string, string | undefined>,
    replyTo: string,
  ) {
    const rows = Object.entries(fields)
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<p><b>${esc(k)}:</b> ${esc(v!).replace(/\n/g, '<br>')}</p>`,
      )
      .join('');
    await this.send({
      to: this.config.get<string>('SALES_EMAIL') ?? 'isfleet.eu@gmail.com',
      replyTo,
      subject: oneLine(subject),
      html: rows,
    });
  }
}

/** Subjects are plain text: no escaping, but no line breaks from visitor input either. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** Escapes visitor-typed text before it goes into an email body. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  /**
   * Driver login without SMS: the code goes to the driver's assigned manager,
   * who passes it on. In the manager's interface language.
   */
  async sendDriverLoginCode(
    to: string,
    opts: {
      driverName: string;
      driverPhone: string;
      code: string;
      ttlMinutes: number;
      locale?: string | null;
    },
  ) {
    const copy =
      DRIVER_LOGIN_CODE_COPY[opts.locale ?? 'UK'] ?? DRIVER_LOGIN_CODE_COPY.UK;
    const driver = `${esc(opts.driverName)} (${esc(opts.driverPhone)})`;
    await this.send({
      to,
      subject: oneLine(`${copy.subject} — ${opts.driverName}`),
      html: `
        <p>${copy.intro.replace('{driver}', driver)}</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${esc(opts.code)}</p>
        <p>${copy.ttl.replace('{minutes}', String(opts.ttlMinutes))}</p>
        <p>${copy.warning}</p>
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

/** sendDriverLoginCode copy, keyed by User.uiLocale. */
const DRIVER_LOGIN_CODE_COPY: Record<
  string,
  { subject: string; intro: string; ttl: string; warning: string }
> = {
  UK: {
    subject: 'Код входу для водія',
    intro: 'Водій {driver} не отримав SMS і просить код для входу в IS Fleet:',
    ttl: 'Код одноразовий і діє {minutes} хв.',
    warning:
      'Передайте його водієві телефоном, переконавшись, що це справді він. Якщо водій нічого не просив — проігноруйте цей лист.',
  },
  EN: {
    subject: 'Driver login code',
    intro:
      "Driver {driver} didn't receive the SMS and asks for an IS Fleet login code:",
    ttl: 'The code is single-use and valid for {minutes} min.',
    warning:
      "Pass it to the driver by phone, making sure it's really them. If the driver didn't ask for it, ignore this email.",
  },
  PL: {
    subject: 'Kod logowania dla kierowcy',
    intro:
      'Kierowca {driver} nie otrzymał SMS-a i prosi o kod logowania do IS Fleet:',
    ttl: 'Kod jest jednorazowy i ważny {minutes} min.',
    warning:
      'Przekaż go kierowcy telefonicznie, upewniając się, że to naprawdę on. Jeśli kierowca o nic nie prosił — zignoruj tę wiadomość.',
  },
  LT: {
    subject: 'Vairuotojo prisijungimo kodas',
    intro:
      'Vairuotojas {driver} negavo SMS ir prašo IS Fleet prisijungimo kodo:',
    ttl: 'Kodas vienkartinis ir galioja {minutes} min.',
    warning:
      'Perduokite jį vairuotojui telefonu, įsitikinę, kad tai tikrai jis. Jei vairuotojas nieko neprašė — ignoruokite šį laišką.',
  },
  DE: {
    subject: 'Anmeldecode für Fahrer',
    intro:
      'Fahrer {driver} hat die SMS nicht erhalten und bittet um einen IS Fleet Anmeldecode:',
    ttl: 'Der Code ist einmalig und {minutes} Min. gültig.',
    warning:
      'Geben Sie ihn dem Fahrer telefonisch weiter und stellen Sie sicher, dass er es wirklich ist. Hat der Fahrer nichts angefordert, ignorieren Sie diese E-Mail.',
  },
  RU: {
    subject: 'Код входа для водителя',
    intro:
      'Водитель {driver} не получил SMS и просит код для входа в IS Fleet:',
    ttl: 'Код одноразовый и действует {minutes} мин.',
    warning:
      'Передайте его водителю по телефону, убедившись, что это действительно он. Если водитель ничего не просил — проигнорируйте это письмо.',
  },
};

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

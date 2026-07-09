import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.get('MAIL_USER'),
        pass: this.config.get('MAIL_PASSWORD'),
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
      from: `"IS Fleet" <${this.config.get('MAIL_USER')}>`,
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
      from: `"IS Fleet" <${this.config.get('MAIL_USER')}>`,
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
      from: `"IS Fleet" <${this.config.get('MAIL_USER')}>`,
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
    await this.transporter.sendMail({
      from: `"IS Fleet" <${this.config.get('MAIL_USER')}>`,
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

// @Injectable()
// export class MailService {
//   private resend: Resend;
//   constructor(private config: ConfigService) {
//     this.resend = new Resend(this.config.get('RESEND_API_KEY'));
//   }
//   async sendAdvanceRequest(
//     from: string,
//     to: string,
//     cc: string | null,
//     driverName: string,
//     amount: number,
//     reason: string,
//   ) {
//     await this.resend.emails.send({
//       from: 'IS Fleet <onboarding@resend.dev>',
//       to,
//       cc: cc ?? undefined,
//       replyTo: from,
//       subject: driverName,
//       html: `
//         <p><b>driver:</b> ${driverName}</p>
//         <p><b>amount:</b> ${amount} €</p>
//         <p><b>reason:</b> ${reason}</p>
//       `,
//     });
//   }

//   async sendCompanyInvite(to: string, companyName: string, inviteLink: string) {
//     await this.resend.emails.send({
//       from: 'IS Fleet <onboarding@resend.dev>',
//       to,
//       subject: `Запрошення до IS Fleet — ${companyName}`,
//       html: `
//       <h2>Вітаємо!</h2>
//       <p>Вашу компанію <b>${companyName}</b> було зареєстровано в IS Fleet.</p>
//       <p>Перейдіть по посиланню щоб зареєструватись:</p>
//       <a href="${inviteLink}">${inviteLink}</a>
//     `,
//     });
//   }

//   async sendDispatcherInvite(to: string, inviteLink: string) {
//     await this.resend.emails.send({
//       from: 'IS Fleet <onboarding@resend.dev>',
//       to,
//       subject: `Запрошення до IS Fleet`,
//       html: `
//       <h2>Вітаємо!</h2>
//       <p>Вас запросили до системи IS Fleet як диспетчера.</p>
//       <p>Перейдіть по посиланню щоб зареєструватись:</p>
//       <a href="${inviteLink}">${inviteLink}</a>
//     `,
//     });
//   }
// }

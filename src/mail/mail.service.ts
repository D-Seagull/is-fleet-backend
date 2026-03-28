import { Injectable } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

@Injectable()
export class MailService {
  private resend: Resend;
  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }
  // constructor(private config: ConfigService) {
  //   this.transporter = nodemailer.createTransport({
  //     host: this.config.get('MAIL_HOST'),
  //     port: this.config.get<number>('MAIL_PORT'),
  //     secure: false,
  //     auth: {
  //       user: this.config.get('MAIL_USER'),
  //       pass: this.config.get('MAIL_PASSWORD'),
  //     },
  //     tls: {
  //       ciphers: 'SSLv3',
  //     },
  //   });
  // }

  async sendAdvanceRequest(
    from: string,
    to: string,
    cc: string | null,
    driverName: string,
    amount: number,
    reason: string,
  ) {
    await this.resend.emails.send({
      from: `"IS Fleet" <${this.config.get('MAIL_FROM')}>`,
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
  async sendInvite(to: string, companyName: string, inviteLink: string) {
    try {
      await this.resend.emails.send({
        from: `"IS Fleet" <${this.config.get('MAIL_FROM')}>`,
        to,
        subject: `Запрошення до IS Fleet — ${companyName}`,
        html: `
    <h2>Вітаємо!</h2>
    <p>Вашу компанію <b>${companyName}</b> було зареєстровано в IS Fleet.</p>
    <p>Перейдіть по посиланню щоб зареєструватись:</p>
    <a href="${inviteLink}">${inviteLink}</a>
    `,
      });
    } catch (err) {
      console.error('❌ Email error:', err.message);
      console.error('❌ Email error details:', err);
      throw err;
    }
  }
  //     await this.transporter.sendMail({
  //       from: `"IS Fleet" <${this.config.get('MAIL_FROM')}>`,
  //       to,
  //       subject: `Запрошення до IS Fleet — ${companyName}`,
  //       html: `
  //   <h2>Вітаємо!</h2>
  //   <p>Вашу компанію <b>${companyName}</b> було зареєстровано в IS Fleet.</p>
  //   <p>Перейдіть по посиланню щоб зареєструватись:</p>
  //   <a href="${inviteLink}">${inviteLink}</a>
  //   `,
  //     });
  //   } catch (err) {
  //     console.error('❌ Email error:', err.message);
  //     console.error('❌ Email error details:', err);
  //     throw err;
  //   }
  // }
}

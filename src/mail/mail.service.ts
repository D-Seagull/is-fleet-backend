import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST'),
      port: this.config.get<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: this.config.get('MAIL_USER'),
        pass: this.config.get('MAIL_PASSWORD'),
      },
      tls: {
        ciphers: 'SSLv3',
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
}

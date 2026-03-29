import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }
  async sendAdvanceRequest(
    from: string,
    to: string,
    cc: string | null,
    driverName: string,
    amount: number,
    reason: string,
  ) {
    await this.resend.emails.send({
      from: 'IS Fleet <onboarding@resend.dev>',
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
        from: 'IS Fleet <onboarding@resend.dev>',
        to,
        subject: `Запрошення до IS Fleet — ${companyName}`,
        html: `
          <h2>Вітаємо!</h2>
          <p>Вашу компанію <b>${companyName}</b> було зареєстровано в IS Fleet.</p>
          <a href="${inviteLink}">${inviteLink}</a>
        `,
      });
      console.log('✅ Email sent to:', to);
    } catch (err) {
      console.error('❌ Email error:', err.message);
      throw err;
    }
  }
}

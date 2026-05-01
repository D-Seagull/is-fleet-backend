import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: Twilio | null;
  private readonly fromNumber: string | null;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM');

    if (sid && token && from) {
      this.client = new Twilio(sid, token);
      this.fromNumber = from;
      this.logger.log('Twilio configured');
    } else {
      this.client = null;
      this.fromNumber = null;
      this.logger.warn(
        'Twilio creds missing — SMS will be logged to console only',
      );
    }
  }

  /**
   * Sends a text message. In dev (no Twilio creds) just logs the body so the
   * OTP flow can be tested without provisioning a real SMS provider.
   */
  async send(to: string, body: string): Promise<void> {
    if (!this.client || !this.fromNumber) {
      this.logger.log(`[DEV-SMS → ${to}] ${body}`);
      return;
    }
    await this.client.messages.create({ to, from: this.fromNumber, body });
  }
}

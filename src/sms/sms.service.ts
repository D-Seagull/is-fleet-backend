import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: Twilio | null;
  // Sender — exactly one is used. A Messaging Service (MG...) is preferred for
  // multi-country delivery (Twilio picks the best sender per destination and
  // holds the alphanumeric sender ID / number pool + compliance). A bare FROM
  // (number or registered alphanumeric ID) is the fallback.
  private readonly messagingServiceSid: string | null;
  private readonly fromNumber: string | null;
  // Dev escape hatch: SMS_DEV_LOG=true logs the body instead of sending, even
  // when Twilio creds are present. Lets local dev see OTP codes without
  // spending on / being blocked by a trial account. Never set in production.
  private readonly devLog: boolean;

  constructor(private readonly config: ConfigService) {
    this.devLog = this.config.get<string>('SMS_DEV_LOG') === 'true';
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');

    // Preferred: a scoped, revocable API Key (SK... SID + secret). The SDK
    // still needs the main Account SID (AC...) for account context.
    const apiKeySid = this.config.get<string>('TWILIO_API_KEY_SID');
    const apiKeySecret = this.config.get<string>('TWILIO_API_KEY_SECRET');
    // Legacy fallback: the account's own Auth Token.
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    const msgServiceSid = this.config.get<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );
    const from = this.config.get<string>('TWILIO_FROM');

    const hasSender = Boolean(msgServiceSid || from);
    let client: Twilio | null = null;
    let authKind = '';

    if (accountSid && apiKeySid && apiKeySecret) {
      client = new Twilio(apiKeySid, apiKeySecret, { accountSid });
      authKind = 'API key';
    } else if (accountSid && authToken) {
      client = new Twilio(accountSid, authToken);
      authKind = 'auth token';
    }

    if (this.devLog) {
      this.client = null;
      this.messagingServiceSid = null;
      this.fromNumber = null;
      this.logger.warn('SMS_DEV_LOG=true — SMS will be logged, not sent');
    } else if (client && hasSender) {
      this.client = client;
      this.messagingServiceSid = msgServiceSid ?? null;
      this.fromNumber = from ?? null;
      this.logger.log(
        `Twilio configured (${authKind}, ${
          msgServiceSid ? 'messaging service' : 'from number'
        })`,
      );
    } else {
      this.client = null;
      this.messagingServiceSid = null;
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
    if (!this.client) {
      this.logger.log(`[DEV-SMS → ${to}] ${body}`);
      return;
    }
    await this.client.messages.create({
      to,
      body,
      // Prefer the Messaging Service; fall back to a bare sender.
      ...(this.messagingServiceSid
        ? { messagingServiceSid: this.messagingServiceSid }
        : { from: this.fromNumber! }),
    });
  }
}

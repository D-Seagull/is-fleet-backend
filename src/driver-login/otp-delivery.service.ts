import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from 'src/sms/sms.service';
import { t } from 'src/i18n/i18n';
import { maskPhone } from 'src/common/utils/phone';
import {
  DRIVER_OTP_CHANNELS,
  DriverOtpChannel,
  OtpDeliveryChannel,
  OtpRecipient,
} from './otp-channels';
import { TelegramGatewayChannel } from './telegram-gateway.channel';

class SmsChannel implements OtpDeliveryChannel {
  readonly name = 'sms' as const;
  constructor(private sms: SmsService) {}
  async deliver(driver: OtpRecipient, code: string) {
    await this.sms.send(driver.phone, t(driver.uiLocale, 'sms.otp', { code }));
  }
}

/**
 * WhatsApp: interface only until Twilio Verify WhatsApp is integrated. With
 * the flag on the request still answers ok, and the log says why.
 */
class StubChannel implements OtpDeliveryChannel {
  private readonly logger: Logger;
  constructor(readonly name: 'whatsapp') {
    this.logger = new Logger(`OtpChannel:${name}`);
  }
  deliver(driver: OtpRecipient): Promise<void> {
    this.logger.warn(
      `${this.name} delivery to ${maskPhone(driver.phone)} skipped: not integrated yet`,
    );
    return Promise.resolve();
  }
}

/**
 * Per-method switches. Unset = the default below; only the exact strings
 * "true" / "false" flip it.
 */
const METHOD_FLAGS: Record<DriverOtpChannel, { env: string; on: boolean }> = {
  sms: { env: 'LOGIN_SMS_ENABLED', on: true },
  whatsapp: { env: 'LOGIN_WHATSAPP_ENABLED', on: false },
  telegram: { env: 'LOGIN_TELEGRAM_ENABLED', on: false },
  manager: { env: 'LOGIN_MANAGER_EMAIL_ENABLED', on: true },
};

@Injectable()
export class OtpDeliveryService {
  private readonly channels: Record<
    Exclude<DriverOtpChannel, 'manager'>,
    OtpDeliveryChannel
  >;
  private readonly telegram: TelegramGatewayChannel;

  constructor(
    sms: SmsService,
    private config: ConfigService,
  ) {
    this.telegram = new TelegramGatewayChannel((key) =>
      config.get<string>(key),
    );
    this.channels = {
      sms: new SmsChannel(sms),
      whatsapp: new StubChannel('whatsapp'),
      telegram: this.telegram,
    };
  }

  isEnabled(method: string): method is DriverOtpChannel {
    const flag = METHOD_FLAGS[method as DriverOtpChannel];
    if (!flag) return false;
    // Telegram also needs its Gateway URL + token — never offer a method
    // that can't send.
    if (method === 'telegram' && !this.telegram.configured()) return false;
    const raw = this.config.get<string>(flag.env);
    return raw === 'true' ? true : raw === 'false' ? false : flag.on;
  }

  /** The switched-on methods, in login-screen order (manager last). */
  enabledMethods(): DriverOtpChannel[] {
    return DRIVER_OTP_CHANNELS.filter((m) => this.isEnabled(m));
  }

  /** A direct channel (not `manager`), or null if unknown or switched off. */
  direct(name: string): OtpDeliveryChannel | null {
    if (name === 'manager' || !this.isEnabled(name)) return null;
    return this.channels[name];
  }
}

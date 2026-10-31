import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from 'src/sms/sms.service';
import { MailService } from 'src/mail/mail.service';
import { t } from 'src/i18n/i18n';
import { maskPhone } from 'src/common/utils/phone';
import {
  DriverOtpChannel,
  OtpDeliveryChannel,
  OtpRecipient,
} from './otp-channels';

class SmsChannel implements OtpDeliveryChannel {
  readonly name = 'sms' as const;
  constructor(private sms: SmsService) {}
  enabled() {
    return true;
  }
  availableFor(driver: OtpRecipient) {
    return !!driver.phone;
  }
  async deliver(driver: OtpRecipient, code: string) {
    await this.sms.send(driver.phone, t(driver.uiLocale, 'sms.otp', { code }));
  }
}

class EmailChannel implements OtpDeliveryChannel {
  readonly name = 'email' as const;
  constructor(private mail: MailService) {}
  enabled() {
    return true;
  }
  // Only a confirmed address — an unverified one may be a typo or someone
  // else's mailbox, and the code is a key to the driver's account.
  availableFor(driver: OtpRecipient) {
    return !!driver.email && !!driver.emailVerifiedAt;
  }
  async deliver(driver: OtpRecipient, code: string, ttlMinutes: number) {
    await this.mail.sendDriverOtp(
      driver.email!,
      code,
      ttlMinutes,
      driver.uiLocale,
    );
  }
}

/**
 * WhatsApp / Telegram: interface only, off by default. Real delivery comes
 * later (Twilio Verify WhatsApp, Telegram Gateway). With the flag on but no
 * integration the request still answers ok, and the log says why.
 */
class StubChannel implements OtpDeliveryChannel {
  private readonly logger: Logger;
  constructor(
    readonly name: 'whatsapp' | 'telegram',
    private flag: () => boolean,
  ) {
    this.logger = new Logger(`OtpChannel:${name}`);
  }
  enabled() {
    return this.flag();
  }
  availableFor(driver: OtpRecipient) {
    return !!driver.phone;
  }
  deliver(driver: OtpRecipient): Promise<void> {
    this.logger.warn(
      `${this.name} delivery to ${maskPhone(driver.phone)} skipped: not integrated yet`,
    );
    return Promise.resolve();
  }
}

@Injectable()
export class OtpDeliveryService {
  private readonly channels: Record<
    Exclude<DriverOtpChannel, 'manager'>,
    OtpDeliveryChannel
  >;

  constructor(sms: SmsService, mail: MailService, config: ConfigService) {
    const flag = (key: string) => () => config.get<string>(key) === 'true';
    this.channels = {
      sms: new SmsChannel(sms),
      email: new EmailChannel(mail),
      whatsapp: new StubChannel('whatsapp', flag('OTP_WHATSAPP_ENABLED')),
      telegram: new StubChannel('telegram', flag('OTP_TELEGRAM_ENABLED')),
    };
  }

  /** The channel, or null if unknown or not usable for this driver. */
  usable(name: string, driver: OtpRecipient): OtpDeliveryChannel | null {
    const ch = (this.channels as Record<string, OtpDeliveryChannel>)[name];
    return ch && ch.enabled() && ch.availableFor(driver) ? ch : null;
  }

  /** Channels switched on for everyone, regardless of the driver. */
  enabledForAll(): DriverOtpChannel[] {
    return (['whatsapp', 'telegram'] as const).filter((n) =>
      this.channels[n].enabled(),
    );
  }
}

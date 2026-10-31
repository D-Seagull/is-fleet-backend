import { OtpChannel } from '@prisma/client';

/**
 * How a driver's sign-in code reaches them. One code is generated per request
 * (AuthService) and handed to exactly one channel; the rules — 6 digits,
 * hashed at rest, TTL, attempt limit, single use, rate limits, no account
 * enumeration — are the same for all of them. Each method can be switched
 * off on its own (see OtpDeliveryService.enabledMethods); a method that is
 * off disappears from the login screen and its requests send nothing.
 */
export const DRIVER_OTP_CHANNELS = [
  'sms',
  'whatsapp',
  'telegram',
  'manager',
] as const;
export type DriverOtpChannel = (typeof DRIVER_OTP_CHANNELS)[number];

export const CHANNEL_TO_DB: Record<DriverOtpChannel, OtpChannel> = {
  sms: 'SMS',
  whatsapp: 'WHATSAPP',
  telegram: 'TELEGRAM',
  manager: 'MANAGER',
};

/** The driver fields a channel needs to deliver. */
export interface OtpRecipient {
  id: string;
  phone: string;
  uiLocale: string;
}

/** Delivers a code to the driver directly (every channel but `manager`). */
export interface OtpDeliveryChannel {
  readonly name: Exclude<DriverOtpChannel, 'manager'>;
  deliver(
    driver: OtpRecipient,
    code: string,
    ttlMinutes: number,
  ): Promise<void>;
}

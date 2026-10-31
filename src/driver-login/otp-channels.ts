import { OtpChannel } from '@prisma/client';

/**
 * How a driver's sign-in code reaches them. One code is generated per request
 * (AuthService) and handed to exactly one channel; the rules — 6 digits,
 * hashed at rest, TTL, attempt limit, single use, rate limits, no account
 * enumeration — are the same for all of them.
 */
export const DRIVER_OTP_CHANNELS = [
  'sms',
  'email',
  'whatsapp',
  'telegram',
  'manager',
] as const;
export type DriverOtpChannel = (typeof DRIVER_OTP_CHANNELS)[number];

export const CHANNEL_TO_DB: Record<DriverOtpChannel, OtpChannel> = {
  sms: 'SMS',
  email: 'EMAIL',
  whatsapp: 'WHATSAPP',
  telegram: 'TELEGRAM',
  manager: 'MANAGER',
};

/** The driver fields a channel needs to decide and deliver. */
export interface OtpRecipient {
  id: string;
  phone: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  uiLocale: string;
}

/** Delivers a code to the driver directly (every channel but `manager`). */
export interface OtpDeliveryChannel {
  readonly name: Exclude<DriverOtpChannel, 'manager'>;
  /** Switched on for this deployment (feature flag / provider configured). */
  enabled(): boolean;
  /** Can reach this particular driver (e.g. email only once verified). */
  availableFor(driver: OtpRecipient): boolean;
  deliver(
    driver: OtpRecipient,
    code: string,
    ttlMinutes: number,
  ): Promise<void>;
}

/** `d***@gmail.com` — enough for the driver to recognise their address. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

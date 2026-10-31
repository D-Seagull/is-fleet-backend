import { Logger } from '@nestjs/common';
import { maskPhone } from 'src/common/utils/phone';
import { OtpDeliveryChannel, OtpRecipient } from './otp-channels';

// The Gateway accepts a code lifetime of 30–3600 s.
const MIN_TTL_S = 30;
const MAX_TTL_S = 3600;
const TIMEOUT_MS = 10_000;

interface GatewayResponse {
  ok: boolean;
  error?: string;
  result?: {
    request_id: string;
    request_cost?: number;
    remaining_balance?: number;
  };
}

/**
 * Telegram Gateway (core.telegram.org/gateway): delivers OUR code to the
 * phone's Telegram account through the official "Verification Codes" chat.
 * We pass the code we generated (`code`), so verification stays ours —
 * hashed, attempt-limited, single use. Billed per delivered code; a number
 * without Telegram answers with an error and costs nothing.
 *
 * Config: TELEGRAM_GATEWAY_URL (API base) + TELEGRAM_GATEWAY_TOKEN (from
 * gateway.telegram.org → API). Neither the token nor the code is ever logged.
 */
export class TelegramGatewayChannel implements OtpDeliveryChannel {
  readonly name = 'telegram' as const;
  private readonly logger = new Logger('OtpChannel:telegram');

  /** `env(key)` reads config on every call (ConfigService.get). */
  constructor(private env: (key: string) => string | undefined) {}

  private get baseUrl() {
    return this.env('TELEGRAM_GATEWAY_URL');
  }
  private get token() {
    return this.env('TELEGRAM_GATEWAY_TOKEN');
  }

  /** Both URL and token set — otherwise the method can't be offered. */
  configured() {
    return !!this.baseUrl && !!this.token;
  }

  async deliver(driver: OtpRecipient, code: string, ttlMinutes: number) {
    if (!this.configured()) {
      throw new Error('Telegram Gateway is not configured');
    }
    const ttl = Math.min(MAX_TTL_S, Math.max(MIN_TTL_S, ttlMinutes * 60));
    const res = await fetch(
      `${this.baseUrl!.replace(/\/+$/, '')}/sendVerificationMessage`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone_number: driver.phone, code, ttl }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const data = (await res.json().catch(() => null)) as GatewayResponse | null;
    if (!data?.ok) {
      throw new Error(
        `Telegram Gateway: ${data?.error ?? `HTTP ${res.status}`}`,
      );
    }
    this.logger.log(
      `Code sent to ${maskPhone(driver.phone)} — request ${data.result?.request_id}, cost ${
        data.result?.request_cost ?? '?'
      }, balance ${data.result?.remaining_balance ?? '?'}`,
    );
  }
}

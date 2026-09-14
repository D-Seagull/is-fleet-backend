/**
 * Sentry bootstrap. MUST be the first import in main.ts — the SDK patches
 * http, pg and friends at require time, and anything imported before it stays
 * uninstrumented.
 *
 * With no SENTRY_DSN set the SDK initialises disabled: every capture call
 * becomes a no-op. That is deliberate — local development and any environment
 * without the variable stay silent, and nothing has to be commented out.
 */
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  environment: process.env.NODE_ENV ?? 'development',

  // This app carries driver phone numbers, addresses and chat messages. Never
  // let the SDK attach request bodies, cookies, headers or user IPs on its own.
  sendDefaultPii: false,

  // Errors only. Performance tracing on a Socket.io app generates a large,
  // low-value span volume and would burn the quota within days; turn it on
  // deliberately later if we ever need latency data.
  tracesSampleRate: 0,

  /**
   * Second line of defence behind sendDefaultPii. The SDK's own redaction
   * rules change between versions, so strip the sensitive parts of the request
   * ourselves rather than trusting the default to stay conservative.
   */
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  },
});

export const sentryEnabled = Boolean(dsn);

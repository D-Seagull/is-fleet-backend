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

  // Errors only. Performance tracing on a Socket.io app generates a large,
  // low-value span volume and would burn the quota that errors need.
  tracesSampleRate: 0,

  /**
   * Stated explicitly, one category at a time. The v10 defaults are far more
   * permissive than this app can afford — request bodies, database query data
   * (including returned rows) and stack-frame locals are all collected unless
   * told otherwise. `sendDefaultPii` used to cover this but is deprecated in
   * v10, removed in v11, and ignored outright when `dataCollection` is set.
   */
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    // Prisma result rows are driver names, phone numbers and message text.
    databaseQueryData: false,
    // A local named `message`, `phone` or `token` is exactly what must not
    // leave the server; nest build keeps real names, so this would be literal.
    stackFrameVariables: false,
  },

  /**
   * Second line of defence behind dataCollection. The SDK's categories shift
   * between versions; these fields never become acceptable to send.
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

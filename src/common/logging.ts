import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type { Params } from 'nestjs-pino';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Structured logging config for `nestjs-pino`.
 *
 * - Prod: raw JSON on stdout (Render ingests/indexes it).
 * - Dev: pretty, colorized single-line output via `pino-pretty`.
 * - Every HTTP request gets a request-id (`req.id`) so all log lines of one
 *   request can be correlated; an inbound `X-Request-Id` is honored so a
 *   trace can span services, and the id is echoed back on the response.
 * - Credentials (Authorization header, cookies, Set-Cookie) are stripped
 *   before anything is written — tokens must never reach the logs.
 * - `/health` requests are skipped so uptime pings don't flood the logs.
 */
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),

    genReqId: (req, res) => {
      const inbound = req.headers['x-request-id'];
      const id =
        (Array.isArray(inbound) ? inbound[0] : inbound) ?? randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },

    transport: isProd
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },

    autoLogging: {
      ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/health'),
    },

    // Trim pino's default req/res serializers down to the useful fields.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  },
};

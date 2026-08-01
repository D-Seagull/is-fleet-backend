import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { t } from '../../i18n/i18n';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Pick the response language: the authenticated user's `language`
   * (populated by the JWT strategy) first, then the `Accept-Language`
   * header sent by the client, then UK. Any string that isn't a known
   * catalog key passes through `t()` unchanged, so this is safe to run on
   * every message.
   */
  private localeOf(request: {
    user?: { language?: string };
    headers?: Record<string, unknown>;
  }): string {
    if (request.user?.language) return request.user.language;
    const header = request.headers?.['accept-language'];
    if (typeof header === 'string' && header.length > 0) {
      return header.split(',')[0].split('-')[0];
    }
    return 'uk';
  }

  /** Translate a keyed message in place, preserving the response shape.
   *  Handles plain strings, class-validator message arrays, and the
   *  `{ statusCode, message, error }` object Nest wraps string exceptions in. */
  private translate(message: unknown, locale: string): unknown {
    const tr = (v: unknown) => (typeof v === 'string' ? t(locale, v) : v);
    if (typeof message === 'string') return t(locale, message);
    if (Array.isArray(message)) return message.map(tr);
    if (message && typeof message === 'object') {
      const obj = message as Record<string, unknown>;
      if (typeof obj.message === 'string') {
        return { ...obj, message: t(locale, obj.message) };
      }
      if (Array.isArray(obj.message)) {
        return { ...obj, message: obj.message.map(tr) };
      }
    }
    return message;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    // WebSocket & RPC contexts have no HTTP response object — skip HTTP error handling
    if (host.getType() !== 'http') {
      this.logger.error(
        `[non-HTTP] ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'errors.recordExists';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'errors.recordNotFound';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'Database error';
      }
    }

    // Localize any keyed message to the requester's language (no-op for
    // non-keyed strings and validation-error arrays).
    message = this.translate(message, this.localeOf(request));

    // Log everything we're not handing back as a 4xx — these are the
    // bugs / infra failures we actually need visibility into. HttpExceptions
    // are expected (validation, forbidden, not found, …) and only deserve
    // a debug-level note.
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (exception instanceof HttpException) {
      this.logger.debug(`${request.method} ${request.url} → ${status}`);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}

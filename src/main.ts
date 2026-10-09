// Must stay the first import: the Sentry SDK patches http/pg at require
// time, so anything imported above it would run uninstrumented.
import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AdminInterceptor } from './common/interceptors/admin.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { corsOrigin } from './common/cors-origin';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/nestjs';
import helmet from 'helmet';
// Process-level safety net: log stray async errors through the normal logger
// rather than letting Node take the whole server down on a single unhandled
// rejection. (Replaces the temporary crash.log diagnostics.)
const processLogger = new Logger('Process');
process.on('unhandledRejection', (reason) => {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  processLogger.error(`Unhandled promise rejection: ${detail}`);
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  processLogger.error(`Uncaught exception: ${err.stack ?? err.message}`);
  Sentry.captureException(err);
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bufferLogs holds startup logs until the pino logger is installed below,
  // so even bootstrap output is structured.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  // Render puts one proxy in front of us: take the client address it adds to
  // X-Forwarded-For. Without this req.ip is the proxy, and rate limits keyed
  // by IP would lump every user together (common/throttle.ts).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  // TEMP (2026-10-09) — check the hop count above on Render: req.ip must be
  // the phone's / browser's address, not the same 10.x proxy for everyone.
  // Logs each new address once (first 50). Remove once confirmed.
  const seenIps = new Set<string>();
  app.use(
    (
      req: import('express').Request,
      _res: import('express').Response,
      next: () => void,
    ) => {
      const ip = req.ip ?? '?';
      if (seenIps.size < 50 && !seenIps.has(ip)) {
        seenIps.add(ip);
        console.log('[client-ip]', ip, 'xff=', req.headers['x-forwarded-for']);
      }
      next();
    },
  );
  // Security headers. Two deliberate relaxations:
  //  - CSP off: this process serves JSON plus the Swagger UI at /api, and the
  //    default policy blocks Swagger's inline bootstrap scripts.
  //  - CORP cross-origin: the web app and both mobile apps live on other
  //    origins, so same-origin resource blocking would reject their responses.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Parses Cookie header into req.cookies so the auth controller can read the
  // httpOnly refresh_token cookie on /auth/refresh and /auth/logout.
  app.use(cookieParser());
  // TEMP (2026-10-04) — diagnosing "Network Error" on some Android PDF
  // uploads: did the request arrive, how big, and did it finish or abort?
  // Remove once found.
  app.use(
    (
      req: import('express').Request,
      res: import('express').Response,
      next: () => void,
    ) => {
      if (!req.url.includes('upload-many')) return next();
      const started = Date.now();
      const tag = `[upload] ${req.method} ${req.url}`;
      console.log(tag, 'arrived', {
        type: req.headers['content-type'],
        length: req.headers['content-length'],
      });
      req.on('aborted', () =>
        console.log(tag, 'ABORTED by client after', Date.now() - started, 'ms'),
      );
      res.on('finish', () =>
        console.log(
          tag,
          'answered',
          res.statusCode,
          'in',
          Date.now() - started,
          'ms',
        ),
      );
      res.on('close', () => {
        if (!res.writableFinished)
          console.log(
            tag,
            'connection closed before answer',
            Date.now() - started,
            'ms',
          );
      });
      next();
    },
  );
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app

    .useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true, // required for @ValidateNested + @Type() to work
      }),
    )
    .useGlobalFilters(new AllExceptionsFilter())
    .useGlobalInterceptors(new AdminInterceptor());

  const config = new DocumentBuilder()
    .setTitle('IS Fleet API')
    .setDescription('Documentation for API for IS Fleet ')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`Сервер летить на ${port}`);
}
bootstrap().catch((err) => {
  // console.error, not Logger: once pino is installed the Nest Logger writes
  // through it, and a pino transport (pino-pretty, whenever NODE_ENV isn't
  // 'production') is async — process.exit below kills it before the line
  // lands, so a boot crash (e.g. Prisma failing to connect in onModuleInit)
  // would exit 1 with no trace in the Render logs.
  console.error('Bootstrap failed:', err);
  Sentry.captureException(err);
  // exit() would kill the process before the event is sent.
  void Sentry.flush(2000).finally(() => process.exit(1));
});

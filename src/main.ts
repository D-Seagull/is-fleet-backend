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
// Process-level safety net.
//  - unhandledRejection: log + Sentry, keep serving. A forgotten `await` on a
//    fire-and-forget push / socket emit lands here; the rejected promise is
//    already settled, nothing is left half-done, and dropping every socket
//    of every driver for that would be worse than the bug.
//  - uncaughtException: log + Sentry, then exit. After a synchronous throw
//    escaped to the event loop Node's state is undefined (a handler stopped
//    mid-way, locks/timers may be orphaned), so limping on risks silent
//    corruption. Render restarts the service within seconds.
const processLogger = new Logger('Process');
process.on('unhandledRejection', (reason) => {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  processLogger.error(`Unhandled promise rejection: ${detail}`);
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  // console.error for the same reason as in bootstrap's catch below: the
  // async pino transport would lose the line on exit.
  console.error('Uncaught exception, exiting:', err);
  Sentry.captureException(err);
  // exit() would kill the process before the event is sent.
  void Sentry.flush(2000).finally(() => process.exit(1));
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bufferLogs holds startup logs until the pino logger is installed below,
  // so even bootstrap output is structured.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  // How many proxies stand in front of us; req.ip is the address just before
  // them in X-Forwarded-For. Production is Cloudflare (api.isfleet.eu is
  // proxied) → Render's proxy → us, so Render sets TRUST_PROXY_HOPS=2 —
  // verified 2026-10-09: req.ip became the client, not a 162.158.x.x
  // Cloudflare edge. Without it every user looked like a rotating set of
  // Cloudflare servers and IP rate limits (common/throttle.ts) meant nothing.
  // If Cloudflare proxying is ever switched off, set it back to 1: trusting
  // more hops than really exist lets a client forge its address.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
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

  // Swagger is a full map of the API — off in production unless explicitly
  // switched on (SWAGGER_ENABLED=true) for a debugging session.
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true'
  ) {
    const config = new DocumentBuilder()
      .setTitle('IS Fleet API')
      .setDescription('Documentation for API for IS Fleet ')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }
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

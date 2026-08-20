import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AdminInterceptor } from './common/interceptors/admin.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { corsOrigin } from './common/cors-origin';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { appendFileSync } from 'fs';
import { join } from 'path';

// ── TEMPORARY crash diagnostics ─────────────────────────────────────────────
// Captures whatever is killing the process (Node 24 exits on unhandled
// rejections). Logs the full stack to the console AND to crash.log so it
// survives terminal scroll. We intentionally DON'T exit — this keeps the
// backend alive while we identify the culprit. ⚠️ REMOVE after diagnosis.
function logCrash(kind: string, err: unknown) {
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const line = `\n[${new Date().toISOString()}] ${kind}\n${stack}\n`;
  console.error(`\x1b[41m\x1b[97m ${kind} \x1b[0m`, stack);
  try {
    appendFileSync(join(process.cwd(), 'crash.log'), line);
  } catch {
    /* ignore file errors */
  }
}
process.on('unhandledRejection', (reason) =>
  logCrash('UNHANDLED_REJECTION', reason),
);
process.on('uncaughtException', (err) => logCrash('UNCAUGHT_EXCEPTION', err));

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bufferLogs holds startup logs until the pino logger is installed below,
  // so even bootstrap output is structured.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
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
  new Logger('Bootstrap').error('Bootstrap failed', err);
  process.exit(1);
});

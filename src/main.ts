import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AdminInterceptor } from './common/interceptors/admin.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { corsOrigin } from './common/cors-origin';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
// Process-level safety net: log stray async errors through the normal logger
// rather than letting Node take the whole server down on a single unhandled
// rejection. (Replaces the temporary crash.log diagnostics.)
const processLogger = new Logger('Process');
process.on('unhandledRejection', (reason) => {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  processLogger.error(`Unhandled promise rejection: ${detail}`);
});
process.on('uncaughtException', (err) => {
  processLogger.error(`Uncaught exception: ${err.stack ?? err.message}`);
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bufferLogs holds startup logs until the pino logger is installed below,
  // so even bootstrap output is structured.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
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

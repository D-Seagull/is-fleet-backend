import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AdminInterceptor } from './common/interceptors/admin.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Allow LAN dev origins (Expo on a real phone, Next.js dev server, etc.).
  // In production accept the canonical FRONTEND_URL *and* any Vercel
  // preview/branch deploy (`*.vercel.app`) so we don't have to whitelist
  // every PR URL manually.
  const allowedExact = new Set(
    ['http://localhost:3000', process.env.FRONTEND_URL].filter(
      (v): v is string => !!v,
    ),
  );
  const corsOrigins =
    process.env.NODE_ENV === 'production'
      ? (
          origin: string | undefined,
          cb: (err: Error | null, allow?: boolean) => void,
        ) => {
          // Same-origin / curl / mobile webview etc. — no Origin header.
          if (!origin) return cb(null, true);
          if (allowedExact.has(origin)) return cb(null, true);
          if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
            return cb(null, true);
          }
          return cb(new Error(`Origin not allowed by CORS: ${origin}`));
        }
      : true; // reflect request origin in dev
  app.enableCors({
    origin: corsOrigins,
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
  console.log(`Сервер летить на ${port}`);
}
bootstrap().catch(console.error);

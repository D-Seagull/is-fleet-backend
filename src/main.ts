import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AdminInterceptor } from './common/interceptors/admin.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['https://is-fleet-frontend.vercel.app'],
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

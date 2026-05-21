"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const admin_interceptor_1 = require("./common/interceptors/admin.interceptor");
const swagger_1 = require("@nestjs/swagger");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const corsOrigins = process.env.NODE_ENV === 'production'
        ? ['http://localhost:3000', process.env.FRONTEND_URL].filter(Boolean)
        : true;
    app.enableCors({
        origin: corsOrigins,
        credentials: true,
    });
    app
        .useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }))
        .useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter())
        .useGlobalInterceptors(new admin_interceptor_1.AdminInterceptor());
    const config = new swagger_1.DocumentBuilder()
        .setTitle('IS Fleet API')
        .setDescription('Documentation for API for IS Fleet ')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api', app, document);
    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    console.log(`Сервер летить на ${port}`);
}
bootstrap().catch(console.error);
//# sourceMappingURL=main.js.map
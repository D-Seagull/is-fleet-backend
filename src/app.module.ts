import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { PrismaModule } from './prisma/prisma.module';
import { TrucksModule } from './trucks/trucks.module';
import { TripsModule } from './trips/trips.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UsersModule,
    CompaniesModule,
    PrismaModule,
    TrucksModule,
    TripsModule,
    CloudinaryModule,
    DocumentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

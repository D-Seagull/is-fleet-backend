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
import { MessagesModule } from './messages/messages.module';
import { TranslationService } from './translation/translation.service';
import { TranslationModule } from './translation/translation.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AlarmsModule } from './alarms/alarms.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { GroupsModule } from './groups/groups.module';

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
    MessagesModule,
    TranslationModule,
    ScheduleModule.forRoot(),
    AlarmsModule,
    AnnouncementsModule,
    GroupsModule,
  ],
  controllers: [],
  providers: [TranslationService],
})
export class AppModule {}

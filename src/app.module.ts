import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { TrucksModule } from './trucks/trucks.module';
import { TripsModule } from './trips/trips.module';
import { DocumentsModule } from './documents/documents.module';
import { MessagesModule } from './messages/messages.module';
import { TranslationService } from './translation/translation.service';
import { TranslationModule } from './translation/translation.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AlarmsModule } from './alarms/alarms.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { GroupsModule } from './groups/groups.module';
import { AdvanceRequestsModule } from './advance-requests/advance-requests.module';
import { MailModule } from './mail/mail.module';
import { CompaniesModule } from './companies/companies.module';
import { AdminModule } from './admin/admin.module';
import { DirectMessagesModule } from './direct-messages/direct-messages.module';
import { DirectMessagesService } from './direct-messages/direct-messages.service';
import { DirectMessageDocumentsModule } from './direct-message-documents/direct-message-documents.module';
import { GroupMessagesModule } from './group-messages/group-messages.module';
import { GroupMessageDocumentsModule } from './group-message-documents/group-message-documents.module';
import { ReactionsModule } from './reactions/reactions.module';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UsersModule,
    PrismaModule,
    TrucksModule,
    TripsModule,
    DocumentsModule,
    MessagesModule,
    TranslationModule,
    ScheduleModule.forRoot(),
    AlarmsModule,
    AnnouncementsModule,
    GroupsModule,
    AdvanceRequestsModule,
    MailModule,
    CompaniesModule,
    AdminModule,
    DirectMessagesModule,
    DirectMessageDocumentsModule,
    GroupMessagesModule,
    GroupMessageDocumentsModule,
    ReactionsModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [TranslationService, DirectMessagesService],
})
export class AppModule {}

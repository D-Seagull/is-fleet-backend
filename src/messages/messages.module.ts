import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { MessagesController } from './messages.controller';
import { TripChatSessionsService } from './trip-chat-sessions.service';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, JwtModule],
  providers: [MessagesService, MessagesGateway, TripChatSessionsService],
  controllers: [MessagesController],
  exports: [MessagesGateway, MessagesService, TripChatSessionsService],
})
export class MessagesModule {}

import { Module } from '@nestjs/common';
import { GroupMessagesGateway } from './group-messages.gateway';
import { GroupMessagesService } from './group-messages.service';
import { GroupMessagesController } from './group-messages.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GroupMessagesController],
  providers: [GroupMessagesGateway, GroupMessagesService],
})
export class GroupMessagesModule {}

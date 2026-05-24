import { Module } from '@nestjs/common';

import { GroupMessagesService } from './group-messages.service';
import { GroupMessagesController } from './group-messages.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ReactionsModule } from '../reactions/reactions.module';

@Module({
  imports: [PrismaModule, ReactionsModule],
  controllers: [GroupMessagesController],
  providers: [GroupMessagesService],
  exports: [GroupMessagesService],
})
export class GroupMessagesModule {}

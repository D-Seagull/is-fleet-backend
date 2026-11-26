import { Module, forwardRef } from '@nestjs/common';

import { GroupMessagesService } from './group-messages.service';
import { GroupMessagesController } from './group-messages.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { DirectMessagesModule } from '../direct-messages/direct-messages.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    PrismaModule,
    ReactionsModule,
    PushModule,
    forwardRef(() => DirectMessagesModule),
  ],
  controllers: [GroupMessagesController],
  providers: [GroupMessagesService],
  exports: [GroupMessagesService],
})
export class GroupMessagesModule {}

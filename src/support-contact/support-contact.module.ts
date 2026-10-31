import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushModule } from 'src/push/push.module';
import { DirectMessagesModule } from 'src/direct-messages/direct-messages.module';
import { SupportContactService } from './support-contact.service';
import { SupportContactController } from './support-contact.controller';

@Module({
  imports: [PrismaModule, PushModule, DirectMessagesModule],
  providers: [SupportContactService],
  controllers: [SupportContactController],
  exports: [SupportContactService],
})
export class SupportContactModule {}

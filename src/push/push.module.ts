import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PresenceService } from './presence.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PushService, PresenceService],
  exports: [PushService, PresenceService],
})
export class PushModule {}

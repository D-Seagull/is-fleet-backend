import { Module } from '@nestjs/common';

import { TrucksService } from './trucks.service';
import { TrucksController } from './trucks.controller';
import { MessagesModule } from '../messages/messages.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [MessagesModule, PushModule],
  controllers: [TrucksController],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}

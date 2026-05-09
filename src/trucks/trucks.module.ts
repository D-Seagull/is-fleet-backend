import { Module } from '@nestjs/common';

import { TrucksService } from './trucks.service';
import { TrucksController } from './trucks.controller';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  controllers: [TrucksController],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}

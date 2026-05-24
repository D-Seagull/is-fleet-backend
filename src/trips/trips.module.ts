import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { MessagesModule } from '../messages/messages.module';
import { PushModule } from '../push/push.module';
import { ReactionsModule } from '../reactions/reactions.module';

@Module({
  imports: [MessagesModule, PushModule, ReactionsModule],
  providers: [TripsService],
  controllers: [TripsController],
  exports: [TripsService],
})
export class TripsModule {}

import { Module } from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { AlarmsController } from './alarms.controller';
import { PushModule } from '../push/push.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [PushModule, MessagesModule],
  providers: [AlarmsService],
  controllers: [AlarmsController],
})
export class AlarmsModule {}

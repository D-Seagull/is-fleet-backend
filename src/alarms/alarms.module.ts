import { Module } from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { AlarmsController } from './alarms.controller';

@Module({
  providers: [AlarmsService],
  controllers: [AlarmsController],
})
export class AlarmsModule {}

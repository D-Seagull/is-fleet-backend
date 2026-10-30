import { Module } from '@nestjs/common';
import { SmsModule } from 'src/sms/sms.module';
import { MessagesModule } from '../messages/messages.module';
import { DriverTransfersService } from './driver-transfers.service';
import { DriverTransfersController } from './driver-transfers.controller';

@Module({
  imports: [SmsModule, MessagesModule],
  providers: [DriverTransfersService],
  controllers: [DriverTransfersController],
  exports: [DriverTransfersService],
})
export class DriverTransfersModule {}

import { Module } from '@nestjs/common';
import { AdvanceRequestsService } from './advance-requests.service';
import { AdvanceRequestsController } from './advance-requests.controller';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [AdvanceRequestsService],
  controllers: [AdvanceRequestsController],
})
export class AdvanceRequestsModule {}

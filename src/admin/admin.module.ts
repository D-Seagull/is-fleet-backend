import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { MailModule } from 'src/mail/mail.module';
import { MessagesModule } from 'src/messages/messages.module';

@Module({
  imports: [MailModule, MessagesModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}

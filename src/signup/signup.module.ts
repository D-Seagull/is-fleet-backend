import { Module } from '@nestjs/common';
import { MailModule } from 'src/mail/mail.module';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

@Module({
  imports: [MailModule],
  providers: [SignupService],
  controllers: [SignupController],
})
export class SignupModule {}

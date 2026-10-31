import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SmsModule } from 'src/sms/sms.module';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/push/push.module';
import { OtpDeliveryService } from './otp-delivery.service';
import { AuthAuditService } from './auth-audit.service';
import { DriverLoginNoticeService } from './driver-login-notice.service';
import { EmailVerificationService } from './email-verification.service';

/** Driver sign-in building blocks shared by AuthModule and UsersModule. */
@Module({
  imports: [PrismaModule, SmsModule, MailModule, PushModule],
  providers: [
    OtpDeliveryService,
    AuthAuditService,
    DriverLoginNoticeService,
    EmailVerificationService,
  ],
  exports: [
    OtpDeliveryService,
    AuthAuditService,
    DriverLoginNoticeService,
    EmailVerificationService,
  ],
})
export class DriverLoginModule {}

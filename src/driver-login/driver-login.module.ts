import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SmsModule } from 'src/sms/sms.module';
import { SupportContactModule } from 'src/support-contact/support-contact.module';
import { OtpDeliveryService } from './otp-delivery.service';
import { AuthAuditService } from './auth-audit.service';
import { DriverLoginNoticeService } from './driver-login-notice.service';

/** Driver sign-in building blocks shared by AuthModule and UsersModule. */
@Module({
  imports: [PrismaModule, SmsModule, SupportContactModule],
  providers: [OtpDeliveryService, AuthAuditService, DriverLoginNoticeService],
  exports: [OtpDeliveryService, AuthAuditService, DriverLoginNoticeService],
})
export class DriverLoginModule {}

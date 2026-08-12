import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';
import { SmsModule } from 'src/sms/sms.module';
import { MessagesModule } from 'src/messages/messages.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    SmsModule,
    MessagesModule,
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', ''),
        // Short-lived access token — clients silently rotate it via the 30-day
        // refresh token (/auth/refresh). A stolen access token is useless in
        // ~15 min; the refresh token is revocable server-side.
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}

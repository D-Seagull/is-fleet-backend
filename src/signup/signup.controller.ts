import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { byBodyField } from 'src/common/throttle';
import { SignupService } from './signup.service';
import { TrialSignupDto } from './dto/trial-signup.dto';
import { DemoRequestDto } from './dto/demo-request.dto';

const HOUR = 60 * 60_000;

/**
 * Unauthenticated forms on the landing page. Each one can create data or send mail, so the
 * limits are per hour: a few tries per email address and a small budget per IP.
 */
const publicFormThrottle = {
  default: { limit: 3, ttl: HOUR, getTracker: byBodyField('email') },
  ip: { limit: 10, ttl: HOUR },
};

@ApiTags('public')
@Controller('public')
export class SignupController {
  constructor(private signup: SignupService) {}

  @Throttle(publicFormThrottle)
  @HttpCode(200)
  @Post('trial-signup')
  startTrial(@Body() dto: TrialSignupDto) {
    return this.signup.startTrial(dto);
  }

  @Throttle(publicFormThrottle)
  @HttpCode(200)
  @Post('demo-request')
  requestDemo(@Body() dto: DemoRequestDto) {
    return this.signup.requestDemo(dto);
  }
}

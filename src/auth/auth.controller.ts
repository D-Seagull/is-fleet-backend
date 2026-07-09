import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtGuard } from './guards/jwt.guard';
import { GetUser } from './decorators/get-user.decorator';
import type { JwtUser } from './interfaces/jwt-user.interface';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private AuthService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.AuthService.register(dto);
  }
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.AuthService.login(dto);
  }

  @Get('invite/:token')
  checkInvite(@Param('token') token: string) {
    return this.AuthService.checkInvite(token);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@GetUser() user: JwtUser) {
    return this.AuthService.getMe(user.id);
  }

  @Post('driver/request-otp')
  @HttpCode(HttpStatus.OK)
  requestDriverOtp(@Body() dto: RequestOtpDto) {
    return this.AuthService.requestDriverOtp(dto.phone);
  }

  @Post('driver/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyDriverOtp(@Body() dto: VerifyOtpDto) {
    return this.AuthService.verifyDriverOtp(dto.phone, dto.code);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.AuthService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.AuthService.resetPassword(dto.token, dto.password);
  }
}

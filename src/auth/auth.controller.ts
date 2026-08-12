import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

// Cross-site in prod (Vercel frontend → Render backend) needs SameSite=None
// + Secure; on http://localhost dev the same-site Lax cookie works over http.
const IS_PROD = process.env.NODE_ENV === 'production';
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtGuard } from './guards/jwt.guard';
import { GetUser } from './decorators/get-user.decorator';
import type { JwtUser } from './interfaces/jwt-user.interface';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private AuthService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.AuthService.register(dto);
    // Registration always establishes a persistent session.
    this.setRefreshCookie(res, result.refresh_token, true);
    delete (result as { refresh_token?: string }).refresh_token;
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.AuthService.login(dto);
    // Web keeps the refresh token in an httpOnly cookie (JS never sees it);
    // strip it from the JSON body so only the in-memory access token ships.
    this.setRefreshCookie(res, result.refresh_token, dto.remember ?? true);
    delete (result as { refresh_token?: string }).refresh_token;
    return result;
  }

  @Get('invite/:token')
  checkInvite(@Param('token') token: string) {
    return this.AuthService.checkInvite(token);
  }

  // Falls under the global 300/min baseline; polled by the client on
  // every mount so a tight throttle would spuriously log people out.
  @SkipThrottle()
  @Get('me')
  @UseGuards(JwtGuard)
  me(@GetUser() user: JwtUser) {
    return this.AuthService.getMe(user.id);
  }

  // Twilio SMS is billed — keep this stricter than login. Per-IP; a
  // per-phone throttle would need custom tracker (future hardening).
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('driver/request-otp')
  @HttpCode(HttpStatus.OK)
  requestDriverOtp(@Body() dto: RequestOtpDto) {
    return this.AuthService.requestDriverOtp(dto.phone);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('driver/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyDriverOtp(@Body() dto: VerifyOtpDto) {
    return this.AuthService.verifyDriverOtp(dto.phone, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.AuthService.requestPasswordReset(dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.AuthService.resetPassword(dto.token, dto.password);
  }

  // Rotate the refresh token → new access (+ new refresh). Web sends the
  // httpOnly cookie (auto); the driver sends { refreshToken } in the body and
  // reads the new pair back from the body.
  @SkipThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string; remember?: boolean },
  ) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.AuthService.refresh(
      fromCookie ?? body?.refreshToken,
    );
    if (fromCookie) {
      // Web: rotate the cookie (preserving the client's remember choice), and
      // keep the refresh out of the JSON body.
      this.setRefreshCookie(res, result.refresh_token, body?.remember ?? true);
      delete (result as { refresh_token?: string }).refresh_token;
    }
    return result;
  }

  // Revoke the presented refresh token and clear the cookie.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string },
  ) {
    const raw =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      body?.refreshToken;
    await this.AuthService.revokeRefresh(raw);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  private setRefreshCookie(res: Response, token: string, remember: boolean) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      path: '/auth',
      // Persistent (30d) when "remember me" is on; a session cookie otherwise
      // (dropped when the browser closes) so no long-lived token is left behind.
      ...(remember ? { maxAge: REFRESH_COOKIE_MAX_AGE } : {}),
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }
}

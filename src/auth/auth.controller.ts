import {
  Body,
  Controller,
  ForbiddenException,
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
import { RefreshBodyDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { authThrottle, clientIp } from '../common/throttle';
import { isAllowedOrigin } from '../common/cors-origin';
import { JwtGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { GetUser } from './decorators/get-user.decorator';
import type { JwtUser } from './interfaces/jwt-user.interface';
// The refresh cookie is SameSite=None in prod, so the browser attaches it to
// cross-site POSTs too. CORS only stops a foreign page from READING the
// response — the rotation itself would still run. Refuse cookie-borne calls
// from any origin outside the CORS allowlist before touching the token.
// (No Origin header = not a cross-site browser request; let it through.)
function assertCookieOrigin(req: Request) {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    throw new ForbiddenException('Origin not allowed');
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private AuthService: AuthService,
  ) {}

  // Auth limits: per phone / email / token tried, plus per IP — sized so a
  // shipload of drivers behind one NAT can all sign in. common/throttle.ts.
  @Throttle(authThrottle('email', 5, 30))
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

  @Throttle(authThrottle('email', 10, 100))
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.AuthService.login(dto);
    // Native clients (is-manager / is-driver) can't hold an httpOnly cookie, so
    // they pass { mobile: true } and read the refresh token straight from the
    // body — same shape as the driver's verify-otp response.
    if (dto.mobile) {
      return result;
    }
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

  // Polled by the client on every mount — a per-user throttle could log
  // people out spuriously. Still under the per-IP flood backstop.
  @SkipThrottle()
  @Get('me')
  @UseGuards(JwtGuard)
  me(@GetUser() user: JwtUser) {
    return this.AuthService.getMe(user.id);
  }

  // Billed channels (SMS, later WhatsApp): 3/min per phone, and 30/min per
  // IP so one address can't pump codes to many numbers (still room for a
  // ship's crew at once). The same budget covers every channel.
  @Throttle(authThrottle('phone', 3, 30))
  @Post('driver/request-otp')
  @HttpCode(HttpStatus.OK)
  requestDriverOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.AuthService.requestDriverOtp(
      dto.phone,
      dto.channel ?? 'sms',
      clientIp(req),
    );
  }

  // Kept for app builds that shipped the first "send to my manager" button;
  // newer ones call request-otp with channel=manager.
  @Throttle(authThrottle('phone', 3, 30))
  @Post('driver/request-otp-manager')
  @HttpCode(HttpStatus.OK)
  requestDriverOtpViaManager(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.AuthService.requestDriverOtp(
      dto.phone,
      'manager',
      clientIp(req),
    );
  }

  // "Didn't get the code?" — which fallbacks to offer for this phone. Same
  // shape for unknown phones (see AuthService.driverOtpChannels).
  @Throttle(authThrottle('phone', 10, 100))
  @Post('driver/otp-channels')
  @HttpCode(HttpStatus.OK)
  driverOtpChannels(@Body() dto: RequestOtpDto) {
    return this.AuthService.driverOtpChannels();
  }

  // Lets the web / manager app hide buttons for features that are off here.
  @Get('features')
  features() {
    return { managerLoginCode: this.AuthService.managerLoginCodeEnabled() };
  }

  // The truck's manager mints a one-time login code to dictate to the
  // driver. Off unless MANAGER_LOGIN_CODE_ENABLED=true (dev). Per-manager
  // budget: each code is another 5 guesses at the phone.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post('driver/:id/login-code')
  @HttpCode(HttpStatus.OK)
  issueDriverLoginCode(
    @Param('id') driverId: string,
    @GetUser('id') requesterId: string,
    @Req() req: Request,
  ) {
    return this.AuthService.issueDriverLoginCode(
      requesterId,
      driverId,
      clientIp(req),
    );
  }

  @Throttle(authThrottle('phone', 10, 100))
  @Post('driver/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyDriverOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.AuthService.verifyDriverOtp(dto.phone, dto.code, clientIp(req));
  }

  @Throttle(authThrottle('email', 5, 30))
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.AuthService.requestPasswordReset(dto.email);
  }

  @Throttle(authThrottle('token', 10, 30))
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
    @Body() body: RefreshBodyDto,
  ) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (fromCookie) assertCookieOrigin(req);
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
    @Body() body: RefreshBodyDto,
  ) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (fromCookie) assertCookieOrigin(req);
    const raw = fromCookie ?? body?.refreshToken;
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

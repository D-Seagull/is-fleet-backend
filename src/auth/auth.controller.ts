import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
}

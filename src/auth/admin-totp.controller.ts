import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { GetUser } from './decorators/get-user.decorator';
import {
  hashRecoveryCode,
  newRecoveryCodes,
  openSecret,
  sealSecret,
  totpKey,
} from './admin-totp';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

class CodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code: string;
}

class DisableDto extends CodeDto {
  @IsString()
  @MaxLength(200)
  password: string;
}

/** Two-factor (authenticator app) for the platform ADMIN account. */
@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
@Controller('auth/totp')
export class AdminTotpController {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private key() {
    return totpKey({
      TOTP_ENC_KEY: this.config.get<string>('TOTP_ENC_KEY'),
      JWT_SECRET: this.config.get<string>('JWT_SECRET'),
    });
  }

  @Get('status')
  async status(@GetUser('id') userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabledAt: true, totpRecoveryCodes: true },
    });
    return {
      enabled: !!u?.totpEnabledAt,
      recoveryCodesLeft: u?.totpRecoveryCodes.length ?? 0,
    };
  }

  /** New secret (not active yet) — shown as a QR / key to add to the app. */
  @Post('setup')
  async setup(@GetUser('id') userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, totpEnabledAt: true },
    });
    if (!u) throw new UnauthorizedException();
    if (u.totpEnabledAt) throw new BadRequestException('errors.totpAlreadyOn');
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: sealSecret(secret, this.key()) },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, u.email ?? 'admin') };
  }

  /** Confirms the app works (a fresh code), turns 2FA on, returns recovery codes once. */
  @Post('enable')
  async enable(@GetUser('id') userId: string, @Body() dto: CodeDto) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    if (!u?.totpSecret || u.totpEnabledAt) {
      throw new BadRequestException('errors.totpNotSetUp');
    }
    if (!verifyTotp(openSecret(u.totpSecret, this.key()), dto.code)) {
      throw new BadRequestException('errors.totpInvalid');
    }
    const codes = newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabledAt: new Date(),
        totpRecoveryCodes: codes.map((c) => hashRecoveryCode(c, this.key())),
      },
    });
    return { recoveryCodes: codes };
  }

  /** Password + a current code (or a recovery code) to turn it off. */
  @Post('disable')
  async disable(@GetUser('id') userId: string, @Body() dto: DisableDto) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
        totpSecret: true,
        totpEnabledAt: true,
        totpRecoveryCodes: true,
      },
    });
    if (!u?.password || !(await bcrypt.compare(dto.password, u.password))) {
      throw new UnauthorizedException('errors.loginOrPasswordWrong');
    }
    if (u.totpEnabledAt && u.totpSecret) {
      const ok =
        verifyTotp(openSecret(u.totpSecret, this.key()), dto.code) ||
        u.totpRecoveryCodes.includes(hashRecoveryCode(dto.code, this.key()));
      if (!ok) throw new BadRequestException('errors.totpInvalid');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] },
    });
    return { ok: true };
  }
}

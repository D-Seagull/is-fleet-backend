import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET', ''),
    });
  }

  // Verify the user still exists & is active on every request. Without this,
  // a token issued before a DB wipe (or for a deactivated user) sails past
  // the JWT guard and then explodes deep in service code with confusing
  // P2003 (FK violation) / P2025 (record not found) errors. Returning 401
  // here lets the mobile client trigger its existing onUnauthorized handler
  // (logout + re-OTP).
  async validate(payload: { sub: string; role: string; companyId: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, companyId: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'User no longer exists or is deactivated',
      );
    }
    return {
      id: user.id,
      // Trust DB over the token — role/companyId could have changed since
      // the JWT was minted (rare, but cheap to keep in sync now that we
      // already pay for the lookup).
      role: user.role,
      companyId: user.companyId,
    };
  }
}

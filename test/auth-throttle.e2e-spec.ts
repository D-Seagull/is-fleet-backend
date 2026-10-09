import { Test } from '@nestjs/testing';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Throttle, ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { THROTTLERS } from '../src/common/throttle';

// expo-server-sdk is ESM-only and is pulled in transitively when we import
// AuthController → auth.service → messages.gateway → push.service. AuthService
// itself is a useValue mock below, so this stub just keeps the graph parseable.
jest.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken() {
      return true;
    }
  },
}));

process.env.JWT_SECRET = 'test-secret';

// A signed-in route with a tiny per-user limit, to see whose bucket counts.
@Controller('probe')
class ProbeController {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get()
  get() {
    return { ok: true };
  }
}

// Real throttler config (common/throttle.ts) + the real @Throttle decorators
// on AuthController. The guard runs before the handler, so a mocked
// AuthService is enough — no DB is touched. Every test uses its own client
// address (X-Forwarded-For, trusted like on Render) so buckets don't mix.
describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  const jwt = new JwtService({ secret: 'test-secret' });

  const authServiceMock = {
    requestDriverOtp: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(THROTTLERS)],
      controllers: [AuthController, ProbeController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', 1);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const otp = (ip: string, phone: string) =>
    request(app.getHttpServer())
      .post('/auth/driver/request-otp')
      .set('X-Forwarded-For', ip)
      .send({ phone });

  const probe = (ip: string, token?: string) => {
    const r = request(app.getHttpServer())
      .get('/probe')
      .set('X-Forwarded-For', ip);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  it('allows 3 OTP requests per phone, then 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await otp('10.0.0.1', '+380971234567')).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('counts the phone however it is written', async () => {
    await otp('10.0.0.2', '+380 97 111 22 33');
    await otp('10.0.0.2', '380971112233');
    await otp('10.0.0.2', '+38 (097) 111-22-33');
    expect((await otp('10.0.0.2', '+380971112233')).status).toBe(429);
  });

  it('lets a whole crew behind one NAT request codes', async () => {
    // 20 drivers, one ship IP — each phone has its own budget.
    for (let i = 0; i < 20; i++) {
      const r = await otp(
        '10.0.0.3',
        `+3809700000${String(i).padStart(2, '0')}`,
      );
      expect(r.status).toBe(200);
    }
  });

  it('caps OTP per IP at 30/min, so one address cannot pump SMS', async () => {
    for (let i = 0; i < 30; i++) {
      await otp('10.0.0.4', `+4860000${String(i).padStart(4, '0')}`);
    }
    expect((await otp('10.0.0.4', '+48600009999')).status).toBe(429);
    // Another address is unaffected.
    expect((await otp('10.0.0.5', '+48600009999')).status).toBe(200);
  });

  it('gives each signed-in user their own budget behind one IP', async () => {
    const alice = await jwt.signAsync({ sub: 'alice' });
    const bob = await jwt.signAsync({ sub: 'bob' });
    expect((await probe('10.0.0.6', alice)).status).toBe(200);
    expect((await probe('10.0.0.6', alice)).status).toBe(200);
    expect((await probe('10.0.0.6', alice)).status).toBe(429);
    // Same IP, different user: not affected by Alice's limit.
    expect((await probe('10.0.0.6', bob)).status).toBe(200);
  });

  it('does not trust a forged token: falls back to the IP', async () => {
    const forged = new JwtService({ secret: 'wrong' });
    const tokens = await Promise.all(
      ['x1', 'x2', 'x3'].map((sub) => forged.signAsync({ sub })),
    );
    const statuses: number[] = [];
    for (const t of tokens) statuses.push((await probe('10.0.0.7', t)).status);
    // Fresh "users" each time would all pass; keyed by IP, the 3rd is cut.
    expect(statuses).toEqual([200, 200, 429]);
  });
});

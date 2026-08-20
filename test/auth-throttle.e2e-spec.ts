import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

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

// Verifies the real @Throttle decorator on POST /auth/driver/request-otp
// (limit: 3/min — the strictest route, since Twilio SMS is billed). The
// throttler guard runs before the route handler, so a mocked AuthService is
// enough — no DB is touched.
describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication;

  const authServiceMock = {
    requestDriverOtp: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const hit = () =>
    request(app.getHttpServer())
      .post('/auth/driver/request-otp')
      .send({ phone: '+380971234567' });

  it('allows the first 3 OTP requests then blocks the 4th with HTTP 429', async () => {
    const r1 = await hit();
    const r2 = await hit();
    const r3 = await hit();
    const r4 = await hit();

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(429); // ThrottlerException — Too Many Requests

    // The blocked request never reached the handler.
    expect(authServiceMock.requestDriverOtp).toHaveBeenCalledTimes(3);
  });
});

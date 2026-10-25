import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

// HTTP-level check of the public forms: routes, status codes and what the global
// ValidationPipe (whitelist + transform, as in main.ts) lets through to the service.
describe('SignupController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    startTrial: jest.fn().mockResolvedValue({ ok: true }),
    requestDemo: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SignupController],
      providers: [{ provide: SignupService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST /public/trial-signup trims, lowercases the email and drops unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/public/trial-signup')
      .send({
        companyName: '  Acme Haulage ',
        name: ' Anna ',
        email: ' Anna@Acme.EU ',
        trucks: '11–50',
        role: 'ADMIN',
      })
      .expect(200, { ok: true });

    expect(service.startTrial).toHaveBeenCalledWith({
      companyName: 'Acme Haulage',
      name: 'Anna',
      email: 'anna@acme.eu',
      trucks: '11–50',
    });
  });

  it('rejects a bad email or a missing company with 400', async () => {
    await request(app.getHttpServer())
      .post('/public/trial-signup')
      .send({ companyName: 'Acme', name: 'Anna', email: 'not-an-email' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/public/trial-signup')
      .send({ name: 'Anna', email: 'anna@acme.eu' })
      .expect(400);
    expect(service.startTrial).not.toHaveBeenCalled();
  });

  it('POST /public/demo-request accepts a message and caps its length', async () => {
    await request(app.getHttpServer())
      .post('/public/demo-request')
      .send({
        name: 'Anna',
        company: 'Acme',
        email: 'anna@acme.eu',
        message: 'Hello',
      })
      .expect(200, { ok: true });
    expect(service.requestDemo).toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/public/demo-request')
      .send({
        name: 'Anna',
        company: 'Acme',
        email: 'anna@acme.eu',
        message: 'x'.repeat(2001),
      })
      .expect(400);
  });
});

import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@db.example.com:6543/postgres?pgbouncer=true',
  DIRECT_URL: 'postgresql://u:p@db.example.com:5432/postgres',
  JWT_SECRET: 'x'.repeat(64),
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const errorOf = (env: Record<string, unknown>) => {
  try {
    validateEnv(env);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
};

describe('validateEnv', () => {
  it('accepts a minimal dev environment and returns it untouched', () => {
    const env = { ...base, PORT: '2024', TWILIO_FROM: '' };
    expect(validateEnv(env)).toBe(env);
    expect(env.PORT).toBe('2024');
  });

  it('names every missing required variable at once', () => {
    const msg = errorOf({});
    for (const key of [
      'DATABASE_URL',
      'DIRECT_URL',
      'JWT_SECRET',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]) {
      expect(msg).toContain(key);
    }
  });

  it('treats an empty value as missing', () => {
    expect(errorOf({ ...base, JWT_SECRET: '' })).toContain('JWT_SECRET');
  });

  it('rejects a short JWT_SECRET without echoing it', () => {
    const msg = errorOf({ ...base, JWT_SECRET: 'secret-value-123' });
    expect(msg).toContain('at least 32 characters');
    expect(msg).not.toContain('secret-value-123');
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(errorOf({ ...base, DATABASE_URL: 'mysql://x@y/z' })).toContain(
      'DATABASE_URL',
    );
  });

  it('requires FRONTEND_URL only in production', () => {
    expect(errorOf({ ...base, NODE_ENV: 'development' })).toBeNull();
    expect(errorOf({ ...base, NODE_ENV: 'production' })).toContain(
      'FRONTEND_URL',
    );
    expect(
      errorOf({
        ...base,
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.example.com',
      }),
    ).toBeNull();
  });

  it('accepts a localhost FRONTEND_URL', () => {
    expect(
      errorOf({ ...base, FRONTEND_URL: 'http://localhost:3000' }),
    ).toBeNull();
  });

  it('validates optional variables only when set', () => {
    expect(errorOf({ ...base, REVIEW_OTP: '12345' })).toContain('REVIEW_OTP');
    expect(errorOf({ ...base, PORT: 'abc' })).toContain('PORT');
    expect(errorOf({ ...base, TRUST_PROXY_HOPS: '9' })).toContain(
      'TRUST_PROXY_HOPS',
    );
    expect(errorOf({ ...base, SWAGGER_ENABLED: 'yes' })).toContain(
      'SWAGGER_ENABLED',
    );
    expect(errorOf({ ...base, CORS_PREVIEW_ORIGIN_RE: '([' })).toContain(
      'CORS_PREVIEW_ORIGIN_RE',
    );
    expect(
      errorOf({
        ...base,
        LANDING_URL: 'https://isfleet.eu, https://www.isfleet.eu',
        CORS_PREVIEW_ORIGIN_RE: '^https://x-[a-z0-9-]+\\.vercel\\.app$',
        SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
        TRUST_PROXY_HOPS: '2',
      }),
    ).toBeNull();
    expect(errorOf({ ...base, LANDING_URL: 'isfleet.eu' })).toContain(
      'LANDING_URL',
    );
  });
});

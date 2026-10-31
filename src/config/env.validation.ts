// Implicit conversion reads the design:type metadata; Nest loads this
// polyfill anyway, but the validator must also work on its own (unit tests).
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

// Boot-time check of the environment (ConfigModule.forRoot({ validate })).
// A missing DATABASE_URL or a 10-char JWT_SECRET used to surface much later
// — as a Prisma error on the first query, or as tokens anyone could forge.
// Now the process refuses to start and names every bad variable at once.
//
// Only the variables are checked; the config itself is returned untouched
// (strings stay strings), so config.get() behaves exactly as before.
// Messages name the variable, never its value — these are secrets.

const URL_OPTS = {
  require_tld: false, // http://localhost:3000 is a valid dev FRONTEND_URL
  require_protocol: true,
  protocols: ['http', 'https'],
};

const isProd = (env: EnvironmentVariables) => env.NODE_ENV === 'production';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  // ── Database ──
  // pgbouncer pool (6543) for runtime queries, session mode (5432) for
  // migrations. Both are needed: Prisma reads DIRECT_URL from the schema.
  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  })
  DATABASE_URL!: string;

  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'DIRECT_URL must be a postgresql:// connection string',
  })
  DIRECT_URL!: string;

  // ── Auth ──
  // Signs every access token and keys the OTP / reset-token hashes.
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET!: string;

  // ── Storage ──
  @IsUrl(URL_OPTS)
  SUPABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  // ── Web origins ──
  // In production the CORS allowlist is built from it, and invite / sign-up
  // links point at it — without it the web app can't talk to us at all.
  @ValidateIf((env: EnvironmentVariables) => isProd(env) || !!env.FRONTEND_URL)
  @IsUrl(URL_OPTS, { message: 'FRONTEND_URL must be an http(s) URL' })
  FRONTEND_URL?: string;

  @IsOptional()
  @Matches(/^\s*https?:\/\/[^\s,]+(\s*,\s*https?:\/\/[^\s,]+)*\s*$/, {
    message: 'LANDING_URL must be a comma-separated list of http(s) origins',
  })
  LANDING_URL?: string;

  // ── Optional, but must be well-formed when set ──
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  SENTRY_DSN?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: string;

  // ── Driver sign-in methods: each on/off on its own (exactly "true"/"false") ──
  // Default on.
  @IsOptional()
  @IsIn(['true', 'false'])
  LOGIN_SMS_ENABLED?: string;

  // Default on: the code is emailed to the manager of the driver's truck.
  @IsOptional()
  @IsIn(['true', 'false'])
  LOGIN_MANAGER_EMAIL_ENABLED?: string;

  // Default off — stubs until Twilio Verify WhatsApp / Telegram Gateway.
  @IsOptional()
  @IsIn(['true', 'false'])
  LOGIN_WHATSAPP_ENABLED?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  LOGIN_TELEGRAM_ENABLED?: string;

  // Default off: managers mint a sign-in code on the driver page.
  @IsOptional()
  @IsIn(['true', 'false'])
  MANAGER_LOGIN_CODE_ENABLED?: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'REVIEW_OTP must be exactly 6 digits' })
  REVIEW_OTP?: string;

  @IsOptional()
  @IsIn(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
  LOG_LEVEL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  // Trusting more hops than really exist lets a client forge its IP.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_IP_LIMIT?: number;
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  // `KEY=` in .env arrives as '' — treat it as not set, like the code does.
  const present = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== '' && v !== undefined),
  );
  const env = plainToInstance(EnvironmentVariables, present, {
    enableImplicitConversion: true,
  });
  const problems = validateSync(env, { skipMissingProperties: false }).map(
    (e) =>
      `  - ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
  );

  // A broken regex here would otherwise throw at import of cors-origin.ts.
  const previewRe = present.CORS_PREVIEW_ORIGIN_RE;
  if (typeof previewRe === 'string') {
    try {
      new RegExp(previewRe);
    } catch {
      problems.push(
        '  - CORS_PREVIEW_ORIGIN_RE: not a valid regular expression',
      );
    }
  }

  if (problems.length) {
    throw new Error(
      `Invalid environment configuration:\n${problems.join('\n')}`,
    );
  }
  return config;
}

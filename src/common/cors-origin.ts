// Shared CORS allowlist used by both the HTTP layer (main.ts), every
// Socket.io gateway and the cookie-refresh Origin check (auth.controller.ts).
// In production only exact origins pass: FRONTEND_URL (web app + desktop
// shell) and LANDING_URL (the marketing site — its sign-up / demo forms post
// to /public/*; comma-separate to allow e.g. both https://isfleet.eu and
// https://www.isfleet.eu). Requests without an Origin header (native mobile
// apps, curl, health probes) are allowed through — the mobile apps rely on
// this.
//
// There is deliberately no `*.vercel.app` wildcard: with credentials on and
// the refresh cookie SameSite=None, any page anyone deploys to Vercel could
// call /auth/refresh with a signed-in manager's cookie and read the new
// access token. To let preview deploys talk to this backend, set
// CORS_PREVIEW_ORIGIN_RE to a regex that only matches YOUR project's preview
// URLs (e.g. ^https://is-fleet-frontend-[a-z0-9-]+-<team>\.vercel\.app$).
const allowedExact = new Set(
  [
    process.env.FRONTEND_URL,
    ...(process.env.LANDING_URL ?? '').split(','),
  ]
    .map((u) => u?.trim())
    .filter((v): v is string => !!v),
);

const previewRe = process.env.CORS_PREVIEW_ORIGIN_RE
  ? new RegExp(process.env.CORS_PREVIEW_ORIGIN_RE, 'i')
  : null;

const IS_PROD = process.env.NODE_ENV === 'production';

/** True when a browser at `origin` may make credentialed calls to us. */
export function isAllowedOrigin(origin: string): boolean {
  if (!IS_PROD) return true;
  return allowedExact.has(origin) || !!previewRe?.test(origin);
}

type OriginFn = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void;

export const corsOrigin: true | OriginFn = IS_PROD
  ? (origin, cb) => {
      if (!origin || isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  : true;

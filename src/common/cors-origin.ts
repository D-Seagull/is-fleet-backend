// Shared CORS allowlist used by both the HTTP layer (main.ts) and every
// Socket.io gateway. In production we accept the canonical FRONTEND_URL,
// localhost (handy for staging probes), and any Vercel preview deploy so
// PR URLs work without manual whitelisting. Requests without an Origin
// header (native mobile apps, curl, health probes) are allowed through —
// the driver app relies on this.
const allowedExact = new Set(
  ['http://localhost:3000', process.env.FRONTEND_URL].filter(
    (v): v is string => !!v,
  ),
);

type OriginFn = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void;

export const corsOrigin: true | OriginFn =
  process.env.NODE_ENV === 'production'
    ? (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedExact.has(origin)) return cb(null, true);
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
          return cb(null, true);
        }
        return cb(new Error(`Origin not allowed by CORS: ${origin}`));
      }
    : true;
